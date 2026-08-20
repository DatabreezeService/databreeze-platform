import { createHash } from 'node:crypto';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ProfileMutationInputV1,
  ProfileMutationPortV1,
  ProfileMutationResultV1,
} from '../application/profile-mutation.port.js';

export interface ProfileUserDatabaseRowV1 {
  readonly id: string;
  readonly status: string;
  readonly displayName: string;
  readonly locale: string;
  readonly profileRevision: number;
}

export interface ProfileMutationReceiptDatabaseRowV1 {
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly displayName: string;
  readonly locale: string;
  readonly revision: number;
}

interface ProfileUserDelegateV1 {
  findUnique(input: {
    readonly where: { readonly id: string };
  }): Promise<ProfileUserDatabaseRowV1 | null>;
  updateMany(input: {
    readonly where: {
      readonly id: string;
      readonly status: string;
      readonly profileRevision: number;
    };
    readonly data: {
      readonly displayName: string;
      readonly locale: string;
      readonly profileRevision: { readonly increment: number };
    };
  }): Promise<{ readonly count: number }>;
}

interface ProfileReceiptDelegateV1 {
  findUnique(input: {
    readonly where: {
      readonly userId_idempotencyKey: { readonly userId: string; readonly idempotencyKey: string };
    };
  }): Promise<ProfileMutationReceiptDatabaseRowV1 | null>;
  create(input: {
    readonly data: ProfileMutationReceiptDatabaseRowV1;
  }): Promise<ProfileMutationReceiptDatabaseRowV1>;
}

export interface ProfileMutationDatabaseClientV1 {
  readonly userIdentity: ProfileUserDelegateV1;
  readonly profileMutationReceipt: ProfileReceiptDelegateV1;
  $transaction<TValue>(
    work: (transaction: ProfileMutationDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function requestHash(input: ProfileMutationInputV1): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        actorId: input.actorId,
        displayName: input.displayName,
        locale: input.locale,
        expectedRevision: input.expectedRevision,
      }),
      'utf8',
    )
    .digest('hex');
}

function locale(input: string): 'vi-VN' | 'en' | undefined {
  return input === 'vi-VN' || input === 'en' ? input : undefined;
}

function acceptedFromReceipt(
  row: ProfileMutationReceiptDatabaseRowV1,
  replayed: boolean,
): ProfileMutationResultV1 {
  const id = parseStableIdentifierV1(row.userId);
  const parsedLocale = locale(row.locale);
  if (!id.accepted || !parsedLocale || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    return { accepted: false, code: 'UNAVAILABLE' };
  }
  return {
    accepted: true,
    value: {
      userId: id.value,
      displayName: row.displayName,
      locale: parsedLocale,
      revision: row.revision,
    },
    ...(replayed ? { replayed: true } : {}),
  };
}

export class PrismaProfileMutationAdapter implements ProfileMutationPortV1 {
  public constructor(private readonly client: ProfileMutationDatabaseClientV1) {}

  public async update(input: ProfileMutationInputV1): Promise<ProfileMutationResultV1> {
    const hash = requestHash(input);
    try {
      return await this.client.$transaction(async (transaction) => {
        const existing = await transaction.profileMutationReceipt.findUnique({
          where: {
            userId_idempotencyKey: { userId: input.actorId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existing) {
          return existing.requestHash === hash
            ? acceptedFromReceipt(existing, true)
            : { accepted: false, code: 'IDEMPOTENCY_CONFLICT' };
        }
        const user = await transaction.userIdentity.findUnique({ where: { id: input.actorId } });
        if (!user) return { accepted: false, code: 'NOT_FOUND' };
        if (user.status !== 'ACTIVE') return { accepted: false, code: 'UNAUTHORIZED' };
        if (user.profileRevision !== input.expectedRevision)
          return { accepted: false, code: 'REVISION_CONFLICT' };
        const changed = await transaction.userIdentity.updateMany({
          where: { id: input.actorId, status: 'ACTIVE', profileRevision: input.expectedRevision },
          data: {
            displayName: input.displayName,
            locale: input.locale,
            profileRevision: { increment: 1 },
          },
        });
        if (changed.count !== 1) return { accepted: false, code: 'REVISION_CONFLICT' };
        const row: ProfileMutationReceiptDatabaseRowV1 = {
          userId: input.actorId,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          displayName: input.displayName,
          locale: input.locale,
          revision: input.expectedRevision + 1,
        };
        await transaction.profileMutationReceipt.create({ data: row });
        return acceptedFromReceipt(row, false);
      });
    } catch {
      try {
        const raced = await this.client.profileMutationReceipt.findUnique({
          where: {
            userId_idempotencyKey: { userId: input.actorId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (raced) {
          return raced.requestHash === hash
            ? acceptedFromReceipt(raced, true)
            : { accepted: false, code: 'IDEMPOTENCY_CONFLICT' };
        }
      } catch {
        // Preserve the stable unavailable result below; database details stay internal.
      }
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}
