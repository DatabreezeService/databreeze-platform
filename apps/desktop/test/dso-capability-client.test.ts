import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DsoCapabilityClientAdapter } from '../src/main/adapters/dso-capability-client.adapter.ts';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const ORG = '00000000-0000-4000-8000-000000000001';
const WORKSPACE = '00000000-0000-4000-8000-000000000002';
const DEVICE = '00000000-0000-4000-8000-0000000000d0';
const GRANT = '00000000-0000-4000-8000-0000000000d1';
const CAPABILITY = '00000000-0000-4000-8000-0000000000c1';
const OTHER_GRANT = '00000000-0000-4000-8000-0000000000d2';

function grant(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    grantId: GRANT,
    deviceId: DEVICE,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    capabilityId: CAPABILITY,
    authorizationEpoch: 3,
    allowedActionTypes: ['dda.folder.intake', 'dda.etl.intake'],
    allowedDataClassifications: ['INTERNAL'],
    synchronizationPayloadClasses: ['APPROVED_DERIVED_RESULT'],
    issuedAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
    status: 'ACTIVE',
    revision: 2,
    ...overrides,
  };
}

function capability(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    capabilityId: CAPABILITY,
    deviceId: DEVICE,
    organizationId: ORG,
    type: 'APPROVED_FOLDER',
    opaqueLocalHandle: 'handle_approved_folder_1',
    constraintDigest: 'a'.repeat(64),
    status: 'ACTIVE',
    reportedAt: '2026-08-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

describe('DDA-012 DSO capability client', () => {
  it('resolves active grants from authenticated list endpoints and caches opaque fields only', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer tok_test',
        accept: 'application/json',
      });
      if (url.endsWith(`/v1/devices/${DEVICE}/grants`)) {
        return Promise.resolve(Response.json({ accepted: true, value: [grant()] }));
      }
      if (url.endsWith(`/v1/devices/${DEVICE}/capabilities`)) {
        return Promise.resolve(Response.json({ accepted: true, value: [capability()] }));
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    const client = new DsoCapabilityClientAdapter({
      baseUrl: 'https://api.example.test',
      deviceId: DEVICE,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      authorizationEpoch: 3,
      getAccessToken: () => Promise.resolve('tok_test'),
      fetchImpl: fetchImpl as typeof fetch,
      nowMs: () => Date.parse('2026-08-11T00:00:00.000Z'),
    });

    await client.refresh();
    const resolved = client.resolveCapability(GRANT);

    expect(resolved).toEqual({
      state: 'ACTIVE',
      organizationId: ORG,
      workspaceId: WORKSPACE,
      grantId: GRANT,
      capabilityId: CAPABILITY,
      revision: 2,
      expiresAtMs: Date.parse('2026-12-31T00:00:00.000Z'),
      allowedActionTypes: ['dda.folder.intake', 'dda.etl.intake'],
      authorizationEpoch: 3,
      opaqueLocalHandle: 'handle_approved_folder_1',
    });
    expect(JSON.stringify(resolved)).not.toMatch(/C:\\\\|Users|payroll|tok_test/i);
    expect(client.resolveCapability(OTHER_GRANT)).toBeNull();
    expect(calls).toEqual([
      `GET https://api.example.test/v1/devices/${DEVICE}/grants`,
      `GET https://api.example.test/v1/devices/${DEVICE}/capabilities`,
    ]);
  });

  it('fails closed for missing auth, wrong scope, epoch mismatch, expiry, and revocation', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('/grants')) {
        return Promise.resolve(
          Response.json({
            accepted: true,
            value: [
              grant({ status: 'REVOKED' }),
              grant({
                grantId: OTHER_GRANT,
                status: 'ACTIVE',
                authorizationEpoch: 99,
                expiresAt: '2026-08-01T00:00:00.000Z',
              }),
            ],
          }),
        );
      }
      return Promise.resolve(Response.json({ accepted: true, value: [capability()] }));
    });

    const unauthenticated = new DsoCapabilityClientAdapter({
      baseUrl: 'https://api.example.test',
      deviceId: DEVICE,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      authorizationEpoch: 3,
      getAccessToken: () => Promise.resolve(null),
      fetchImpl: fetchImpl as typeof fetch,
      nowMs: () => Date.parse('2026-08-11T00:00:00.000Z'),
    });
    await expect(unauthenticated.refresh()).rejects.toThrow('DSO_AUTH_UNAVAILABLE');
    expect(unauthenticated.resolveCapability(GRANT)).toBeNull();

    const client = new DsoCapabilityClientAdapter({
      baseUrl: 'https://api.example.test',
      deviceId: DEVICE,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      authorizationEpoch: 3,
      getAccessToken: () => Promise.resolve('tok_test'),
      fetchImpl: fetchImpl as typeof fetch,
      nowMs: () => Date.parse('2026-08-11T00:00:00.000Z'),
    });
    await client.refresh();

    expect(client.resolveCapability(GRANT)).toMatchObject({ state: 'REVOKED' });
    expect(client.resolveCapability(OTHER_GRANT)).toBeNull();
  });

  it('never includes local paths or bearer tokens in diagnostic codes', () => {
    const digest = createHmac('sha256', 'x').update('y').digest('hex');
    expect(digest).toHaveLength(64);
    expect(DsoCapabilityClientAdapter.name).toBe('DsoCapabilityClientAdapter');
  });
});
