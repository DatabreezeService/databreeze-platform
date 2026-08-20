import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ProfileMutationInputV1,
  ProfileMutationPortV1,
  ProfileMutationResultV1,
} from '../application/profile-mutation.port.js';

interface ProfileRecordV1 {
  displayName: string;
  locale: 'vi-VN' | 'en';
  revision: number;
}

function hashInput(input: ProfileMutationInputV1): string {
  return JSON.stringify({
    actorId: input.actorId,
    displayName: input.displayName,
    locale: input.locale,
    expectedRevision: input.expectedRevision,
  });
}

/** Deterministic test/local adapter; production uses the Prisma adapter. */
export class InMemoryProfileMutationAdapter implements ProfileMutationPortV1 {
  private readonly records = new Map<string, ProfileRecordV1>();
  private readonly receipts = new Map<string, { hash: string; result: ProfileMutationResultV1 }>();

  public seed(userId: StableIdentifierV1, record: ProfileRecordV1): void {
    this.records.set(userId, { ...record });
  }

  public update(input: ProfileMutationInputV1): Promise<ProfileMutationResultV1> {
    const receiptKey = `${input.actorId}:${input.idempotencyKey}`;
    const requestHash = hashInput(input);
    const existingReceipt = this.receipts.get(receiptKey);
    if (existingReceipt) {
      return Promise.resolve(
        existingReceipt.hash === requestHash
          ? {
              ...existingReceipt.result,
              ...(existingReceipt.result.accepted ? { replayed: true } : {}),
            }
          : { accepted: false, code: 'IDEMPOTENCY_CONFLICT' },
      );
    }
    const record = this.records.get(input.actorId);
    if (!record) return Promise.resolve({ accepted: false, code: 'NOT_FOUND' });
    if (record.revision !== input.expectedRevision) {
      return Promise.resolve({ accepted: false, code: 'REVISION_CONFLICT' });
    }
    record.displayName = input.displayName;
    record.locale = input.locale;
    record.revision += 1;
    const result: ProfileMutationResultV1 = {
      accepted: true,
      value: {
        userId: input.actorId,
        displayName: record.displayName,
        locale: record.locale,
        revision: record.revision,
      },
    };
    this.receipts.set(receiptKey, { hash: requestHash, result });
    return Promise.resolve(result);
  }
}
