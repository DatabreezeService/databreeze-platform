import { randomUUID } from 'node:crypto';
import {
  parseV4Contract,
  type DdaNotificationPreferencesAccepted,
  type DdaNotificationPreferencesCommand,
} from '@databreeze/contracts/v4';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  DdaDatabaseClientV1,
  DdaNotificationPreferenceRowV1,
} from '../adapter/dda-database.client.js';
import type { NotificationTenantContextV1 } from './notification-repository.port.js';
import {
  defaultNotificationPreferencesV1,
  mandatoryNotificationPreferenceV1,
} from './notification-preferences.defaults.js';
import {
  fingerprintNotificationPreferencesV1,
  type NotificationPreferenceResultV1,
  type NotificationPreferencesPortV1,
} from './notification-preferences.port.js';

const ACCEPTED_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-accepted' as const;
const COMMAND_SCHEMA =
  'https://schemas.databreeze.dev/contracts/v4/dda-notification-preferences-command' as const;

type PreferenceDb = DdaDatabaseClientV1 & {
  readonly ddaNotificationPreferenceSet: NonNullable<
    DdaDatabaseClientV1['ddaNotificationPreferenceSet']
  >;
  readonly ddaNotificationPreference: NonNullable<DdaDatabaseClientV1['ddaNotificationPreference']>;
  readonly ddaNotificationPreferenceCommandReceipt: NonNullable<
    DdaDatabaseClientV1['ddaNotificationPreferenceCommandReceipt']
  >;
};

function hasPreferenceDelegates(client: DdaDatabaseClientV1): client is PreferenceDb {
  return (
    client.ddaNotificationPreferenceSet !== undefined &&
    client.ddaNotificationPreference !== undefined &&
    client.ddaNotificationPreferenceCommandReceipt !== undefined
  );
}

function scope(
  context: NotificationTenantContextV1,
):
  | { readonly organizationId: string; readonly workspaceId: string; readonly recipientId: string }
  | undefined {
  const workspaceId = context.tenantScope.workspaceId;
  if (
    context.tenantScope.scopeType !== 'workspace' ||
    workspaceId === undefined ||
    !parseStableIdentifierV1(context.actorId).accepted ||
    !parseStableIdentifierV1(context.tenantScope.organizationId).accepted ||
    !parseStableIdentifierV1(workspaceId).accepted
  ) {
    return undefined;
  }
  return {
    organizationId: context.tenantScope.organizationId,
    workspaceId,
    recipientId: context.actorId,
  };
}

function quietHours(
  value: unknown,
): value is { readonly enabled: boolean; readonly start: string; readonly end: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['enabled'] === 'boolean' &&
    typeof (value as Record<string, unknown>)['start'] === 'string' &&
    typeof (value as Record<string, unknown>)['end'] === 'string'
  );
}

function rowToPreference(
  row: DdaNotificationPreferenceRowV1,
): DdaNotificationPreferencesAccepted['preferences'][number] | undefined {
  if (!quietHours(row.quietHours)) return undefined;
  const value = {
    category: row.category,
    channel: row.channel,
    enabled: row.enabled,
    minimumUrgency: row.minimumUrgency,
    deliveryMode: row.deliveryMode,
    quietHours: row.quietHours,
    timezone: row.timezone,
    mandatory: row.mandatory,
  };
  const parsed = parseV4Contract<DdaNotificationPreferencesAccepted>(ACCEPTED_SCHEMA, {
    schemaVersion: 4,
    revision: row.revision,
    preferences: [value],
  });
  return parsed.accepted ? parsed.value.preferences[0] : undefined;
}

function snapshotFromRows(
  revision: number,
  rows: readonly DdaNotificationPreferenceRowV1[],
): DdaNotificationPreferencesAccepted | undefined {
  const preferences = rows.map(rowToPreference);
  if (preferences.some((value) => value === undefined) || preferences.length === 0)
    return undefined;
  const parsed = parseV4Contract<DdaNotificationPreferencesAccepted>(ACCEPTED_SCHEMA, {
    schemaVersion: 4,
    revision,
    preferences,
  });
  return parsed.accepted ? parsed.value : undefined;
}

function commandValid(command: DdaNotificationPreferencesCommand): boolean {
  return (
    parseV4Contract<DdaNotificationPreferencesCommand>(COMMAND_SCHEMA, command).accepted &&
    command.preferences.every(
      (preference) =>
        !(mandatoryNotificationPreferenceV1(preference.category) && !preference.enabled),
    )
  );
}

function resultDocument(snapshot: DdaNotificationPreferencesAccepted): {
  readonly snapshot: DdaNotificationPreferencesAccepted;
} {
  return { snapshot };
}

function parseReceipt(value: unknown): DdaNotificationPreferencesAccepted | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const snapshot = (value as Record<string, unknown>)['snapshot'];
  const parsed = parseV4Contract<DdaNotificationPreferencesAccepted>(ACCEPTED_SCHEMA, snapshot);
  return parsed.accepted ? parsed.value : undefined;
}

function mergePreferences(
  base: DdaNotificationPreferencesAccepted,
  command: DdaNotificationPreferencesCommand,
  revision: number,
): DdaNotificationPreferencesAccepted {
  const overrides = new Map(
    command.preferences.map((preference) => [
      `${preference.category}:${preference.channel}`,
      preference,
    ]),
  );
  const preferences = base.preferences.map((preference) => {
    const override = overrides.get(`${preference.category}:${preference.channel}`);
    return override === undefined
      ? preference
      : { ...override, mandatory: mandatoryNotificationPreferenceV1(override.category) };
  });
  return Object.freeze({ schemaVersion: 4, revision, preferences: Object.freeze(preferences) });
}

/** Durable recipient-scoped preference set with CAS and exact idempotent replay. */
export class PrismaNotificationPreferencesAdapter implements NotificationPreferencesPortV1 {
  public constructor(private readonly database: DdaDatabaseClientV1) {}

  public async get(context: NotificationTenantContextV1): Promise<NotificationPreferenceResultV1> {
    const target = scope(context);
    if (target === undefined) return { accepted: false, code: 'UNAUTHORIZED' };
    if (!hasPreferenceDelegates(this.database)) return { accepted: false, code: 'UNAVAILABLE' };
    const database = this.database;
    try {
      const set = await database.ddaNotificationPreferenceSet.findFirst({ where: target });
      if (set === null) return { accepted: true, value: defaultNotificationPreferencesV1() };
      const rows = await database.ddaNotificationPreference.findMany({
        where: { setId: set.id, ...target },
        orderBy: [{ category: 'asc' }, { channel: 'asc' }],
      });
      const snapshot = snapshotFromRows(set.revision, rows);
      return snapshot === undefined
        ? { accepted: false, code: 'UNAVAILABLE' }
        : { accepted: true, value: snapshot };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  public async replace(
    input: Parameters<NotificationPreferencesPortV1['replace']>[0],
  ): Promise<NotificationPreferenceResultV1> {
    const target = scope(input.context);
    if (target === undefined) return { accepted: false, code: 'UNAUTHORIZED' };
    if (!hasPreferenceDelegates(this.database)) return { accepted: false, code: 'UNAVAILABLE' };
    const database = this.database;
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 200 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(input.idempotencyKey) ||
      !commandValid(input.command) ||
      input.fingerprint !== fingerprintNotificationPreferencesV1(input.command)
    ) {
      return { accepted: false, code: 'INVALID_INPUT' };
    }
    const replay = async (): Promise<NotificationPreferenceResultV1 | undefined> => {
      const receipt = await database.ddaNotificationPreferenceCommandReceipt.findFirst({
        where: { ...target, idempotencyKey: input.idempotencyKey },
      });
      if (receipt === null) return undefined;
      const snapshot = parseReceipt(receipt.resultDocument);
      if (snapshot === undefined) return { accepted: false, code: 'UNAVAILABLE' };
      return receipt.fingerprint === input.fingerprint
        ? { accepted: true, value: snapshot, replayed: true }
        : { accepted: false, code: 'IDEMPOTENCY_CONFLICT' };
    };
    try {
      const raced = await replay();
      if (raced !== undefined) return raced;
      const result = await database.$transaction(async (transaction) => {
        const db = transaction as PreferenceDb;
        const existing = await db.ddaNotificationPreferenceSet.findFirst({ where: target });
        const currentRevision = existing?.revision ?? 1;
        if (currentRevision !== input.command.expectedRevision)
          return { kind: 'REVISION_CONFLICT' as const };
        const base =
          existing === null || existing === undefined
            ? defaultNotificationPreferencesV1(currentRevision)
            : snapshotFromRows(
                currentRevision,
                await db.ddaNotificationPreference.findMany({
                  where: { setId: existing.id, ...target },
                }),
              );
        if (base === undefined) return { kind: 'UNAVAILABLE' as const };
        const nextRevision = currentRevision + 1;
        const snapshot = mergePreferences(base, input.command, nextRevision);
        const setId = existing?.id ?? randomUUID();
        if (existing === undefined || existing === null) {
          await db.ddaNotificationPreferenceSet.create({
            data: {
              id: setId,
              ...target,
              revision: nextRevision,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        } else {
          const updated = await db.ddaNotificationPreferenceSet.updateMany({
            where: { id: existing.id, ...target, revision: currentRevision },
            data: { revision: nextRevision, updatedAt: new Date() },
          });
          if (updated.count !== 1) return { kind: 'REVISION_CONFLICT' as const };
          await db.ddaNotificationPreference.deleteMany({
            where: { setId: existing.id, ...target },
          });
        }
        await db.ddaNotificationPreference.createMany({
          data: snapshot.preferences.map((preference) => ({
            id: randomUUID(),
            setId,
            ...target,
            category: preference.category,
            channel: preference.channel,
            enabled: preference.enabled,
            minimumUrgency: preference.minimumUrgency,
            deliveryMode: preference.deliveryMode,
            quietHours: preference.quietHours,
            timezone: preference.timezone,
            mandatory: preference.mandatory,
            revision: nextRevision,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        });
        await db.ddaNotificationPreferenceCommandReceipt.create({
          data: {
            id: randomUUID(),
            ...target,
            expectedRevision: input.command.expectedRevision,
            idempotencyKey: input.idempotencyKey,
            fingerprint: input.fingerprint,
            resultDocument: resultDocument(snapshot),
            createdAt: new Date(),
          },
        });
        return { kind: 'ACCEPTED' as const, snapshot };
      });
      if (result.kind === 'ACCEPTED') return { accepted: true, value: result.snapshot };
      if (result.kind === 'REVISION_CONFLICT')
        return { accepted: false, code: 'REVISION_CONFLICT' };
      return { accepted: false, code: 'UNAVAILABLE' };
    } catch {
      const raced = await replay().catch(() => undefined);
      return raced ?? { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}
