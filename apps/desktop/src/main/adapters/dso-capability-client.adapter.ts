import type { FolderCapabilityRecord } from '../../application/folder-manifest.service.ts';

export interface DsoCapabilityClientInput {
  readonly baseUrl: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly authorizationEpoch: number;
  readonly getAccessToken: () => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: () => number;
}

interface CachedGrant {
  readonly record: FolderCapabilityRecord;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value as readonly string[];
}

export class DsoCapabilityClientAdapter {
  readonly #baseUrl: string;
  readonly #deviceId: string;
  readonly #organizationId: string;
  readonly #workspaceId: string;
  readonly #authorizationEpoch: number;
  readonly #getAccessToken: () => Promise<string | null>;
  readonly #fetchImpl: typeof fetch;
  readonly #nowMs: () => number;
  readonly #cache = new Map<string, CachedGrant>();

  constructor(input: DsoCapabilityClientInput) {
    this.#baseUrl = input.baseUrl.replace(/\/+$/u, '');
    this.#deviceId = input.deviceId;
    this.#organizationId = input.organizationId;
    this.#workspaceId = input.workspaceId;
    this.#authorizationEpoch = input.authorizationEpoch;
    this.#getAccessToken = input.getAccessToken;
    this.#fetchImpl = input.fetchImpl ?? fetch;
    this.#nowMs = input.nowMs ?? (() => Date.now());
  }

  async refresh(): Promise<void> {
    const token = await this.#getAccessToken();
    if (token === null || token.length === 0) {
      this.#cache.clear();
      throw new Error('DSO_AUTH_UNAVAILABLE');
    }

    const headers = Object.freeze({
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    });

    const [grantsResponse, capabilitiesResponse] = await Promise.all([
      this.#fetchImpl(`${this.#baseUrl}/v1/devices/${this.#deviceId}/grants`, {
        method: 'GET',
        headers,
      }),
      this.#fetchImpl(`${this.#baseUrl}/v1/devices/${this.#deviceId}/capabilities`, {
        method: 'GET',
        headers,
      }),
    ]);

    if (!grantsResponse.ok || !capabilitiesResponse.ok) {
      this.#cache.clear();
      throw new Error('DSO_CAPABILITY_UNAVAILABLE');
    }

    const grantsBody = asRecord(await grantsResponse.json());
    const capabilitiesBody = asRecord(await capabilitiesResponse.json());
    if (
      grantsBody?.['accepted'] !== true ||
      capabilitiesBody?.['accepted'] !== true ||
      !Array.isArray(grantsBody['value']) ||
      !Array.isArray(capabilitiesBody['value'])
    ) {
      this.#cache.clear();
      throw new Error('DSO_CAPABILITY_UNAVAILABLE');
    }

    const capabilities = new Map<string, Record<string, unknown>>();
    for (const item of capabilitiesBody['value'] as unknown[]) {
      const capability = asRecord(item);
      const capabilityId = asString(capability?.['capabilityId']);
      if (capabilityId !== null && capability !== null) capabilities.set(capabilityId, capability);
    }

    const next = new Map<string, CachedGrant>();
    const nowMs = this.#nowMs();
    for (const item of grantsBody['value'] as unknown[]) {
      const grant = asRecord(item);
      if (grant === null) continue;
      const grantId = asString(grant['grantId']);
      const capabilityId = asString(grant['capabilityId']);
      const organizationId = asString(grant['organizationId']);
      const workspaceId = asString(grant['workspaceId']);
      const status = asString(grant['status']);
      const authorizationEpoch = asNumber(grant['authorizationEpoch']);
      const revision = asNumber(grant['revision']);
      const allowedActionTypes = asStringArray(grant['allowedActionTypes']);
      if (
        grantId === null ||
        capabilityId === null ||
        organizationId === null ||
        workspaceId === null ||
        status === null ||
        authorizationEpoch === null ||
        revision === null ||
        allowedActionTypes === null
      ) {
        continue;
      }
      if (
        organizationId !== this.#organizationId ||
        workspaceId !== this.#workspaceId ||
        authorizationEpoch !== this.#authorizationEpoch
      ) {
        continue;
      }

      const capability = capabilities.get(capabilityId);
      const opaqueLocalHandle = asString(capability?.['opaqueLocalHandle']) ?? undefined;
      const expiresAt = asString(grant['expiresAt']);
      const expiresAtMs = expiresAt === null ? undefined : Date.parse(expiresAt);
      let state: FolderCapabilityRecord['state'];
      if (status === 'REVOKED') state = 'REVOKED';
      else if (
        status === 'EXPIRED' ||
        (expiresAtMs !== undefined && Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs)
      ) {
        state = 'EXPIRED';
      } else if (status === 'ACTIVE' && capability?.['status'] === 'ACTIVE') state = 'ACTIVE';
      else if (status === 'ACTIVE' && capability?.['status'] === 'REVOKED') state = 'REVOKED';
      else if (status === 'ACTIVE' && capability?.['status'] === 'EXPIRED') state = 'EXPIRED';
      else continue;

      next.set(grantId, {
        record: Object.freeze({
          state,
          organizationId,
          workspaceId,
          grantId,
          capabilityId,
          revision,
          ...(expiresAtMs !== undefined && Number.isFinite(expiresAtMs) ? { expiresAtMs } : {}),
          allowedActionTypes: Object.freeze([...allowedActionTypes]),
          authorizationEpoch,
          ...(opaqueLocalHandle === undefined ? {} : { opaqueLocalHandle }),
        }),
      });
    }

    this.#cache.clear();
    for (const [grantId, cached] of next) this.#cache.set(grantId, cached);
  }

  resolveCapability(capabilityGrantId: string): FolderCapabilityRecord | null {
    return this.#cache.get(capabilityGrantId)?.record ?? null;
  }
}
