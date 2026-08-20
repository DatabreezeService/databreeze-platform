import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  DdaNotificationPreferencesAccepted,
  DdaNotificationPreferencesCommand,
} from '@databreeze/contracts/v4';
import type { NotificationTenantContextV1 } from './notification-repository.port.js';
import {
  defaultNotificationPreferencesV1,
  mandatoryNotificationPreferenceV1,
} from './notification-preferences.defaults.js';
import type {
  NotificationPreferenceResultV1,
  NotificationPreferencesPortV1,
} from './notification-preferences.port.js';

interface StoredPreferenceSetV1 {
  readonly snapshot: DdaNotificationPreferencesAccepted;
  readonly receipts: Map<
    string,
    { readonly fingerprint: string; readonly snapshot: DdaNotificationPreferencesAccepted }
  >;
}

function scopeKey(context: NotificationTenantContextV1): string | undefined {
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
  return `${context.tenantScope.organizationId}:${workspaceId}:${context.actorId}`;
}

function validateCommand(command: DdaNotificationPreferencesCommand): boolean {
  const seen = new Set<string>();
  for (const preference of command.preferences) {
    const key = `${preference.category}:${preference.channel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (mandatoryNotificationPreferenceV1(preference.category) && !preference.enabled) return false;
  }
  return command.preferences.length > 0;
}

export class InMemoryNotificationPreferencesAdapter implements NotificationPreferencesPortV1 {
  private readonly sets = new Map<string, StoredPreferenceSetV1>();

  public constructor(
    seed?: readonly {
      readonly context: NotificationTenantContextV1;
      readonly snapshot: DdaNotificationPreferencesAccepted;
    }[],
  ) {
    for (const item of seed ?? []) {
      const key = scopeKey(item.context);
      if (key !== undefined) this.sets.set(key, { snapshot: item.snapshot, receipts: new Map() });
    }
  }

  public get(context: NotificationTenantContextV1): Promise<NotificationPreferenceResultV1> {
    const key = scopeKey(context);
    if (key === undefined) return Promise.resolve({ accepted: false, code: 'UNAUTHORIZED' });
    const stored = this.sets.get(key);
    if (stored !== undefined) return Promise.resolve({ accepted: true, value: stored.snapshot });
    const snapshot = defaultNotificationPreferencesV1();
    this.sets.set(key, { snapshot, receipts: new Map() });
    return Promise.resolve({ accepted: true, value: snapshot });
  }

  public replace(
    input: Parameters<NotificationPreferencesPortV1['replace']>[0],
  ): Promise<NotificationPreferenceResultV1> {
    const key = scopeKey(input.context);
    if (key === undefined) return Promise.resolve({ accepted: false, code: 'UNAUTHORIZED' });
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 200 ||
      !validateCommand(input.command)
    ) {
      return Promise.resolve({ accepted: false, code: 'INVALID_INPUT' });
    }
    const stored: StoredPreferenceSetV1 = this.sets.get(key) ?? {
      snapshot: defaultNotificationPreferencesV1(),
      receipts: new Map<
        string,
        { readonly fingerprint: string; readonly snapshot: DdaNotificationPreferencesAccepted }
      >(),
    };
    const replay = stored.receipts.get(input.idempotencyKey);
    if (replay !== undefined) {
      return Promise.resolve(
        replay.fingerprint === input.fingerprint
          ? { accepted: true, value: replay.snapshot, replayed: true }
          : { accepted: false, code: 'IDEMPOTENCY_CONFLICT' },
      );
    }
    if (stored.snapshot.revision !== input.command.expectedRevision) {
      return Promise.resolve({ accepted: false, code: 'REVISION_CONFLICT' });
    }
    const nextRevision = stored.snapshot.revision + 1;
    const snapshot: DdaNotificationPreferencesAccepted = Object.freeze({
      schemaVersion: 4,
      revision: nextRevision,
      preferences: Object.freeze(
        input.command.preferences.map((preference) => ({
          ...preference,
          mandatory: mandatoryNotificationPreferenceV1(preference.category),
        })),
      ),
    });
    const receipts = new Map(stored.receipts);
    receipts.set(input.idempotencyKey, { fingerprint: input.fingerprint, snapshot });
    this.sets.set(key, { snapshot, receipts });
    return Promise.resolve({ accepted: true, value: snapshot });
  }
}
