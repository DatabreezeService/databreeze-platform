import { describe, expect, it, vi } from 'vitest';
import {
  FolderManifestService,
  type FolderBindingStore,
} from '../src/application/folder-manifest.service.ts';
import type { FolderBindingPort } from '../src/application/folder-binding.port.ts';
import type { FolderManifestPolicyV1 } from '../src/shared/folder-binding-contract-v1.ts';

const ORG = '01AAAAAAAAAAAAAAAAAAAAAAAA';
const WORKSPACE = '01BBBBBBBBBBBBBBBBBBBBBBBB';
const CAPABILITY = '01CCCCCCCCCCCCCCCCCCCCCCCC';
const CAP_REVOKED = '01DDDDDDDDDDDDDDDDDDDDDDDD';
const CAP_OTHER = '01EEEEEEEEEEEEEEEEEEEEEEEE';
const ORG_OTHER = '01FFFFFFFFFFFFFFFFFFFFFFFF';

function validManifest(overrides: Partial<FolderManifestPolicyV1> = {}): FolderManifestPolicyV1 {
  return {
    purpose: 'sales-intake',
    supportedProfiles: ['CSV', 'XLSX'],
    schemaFingerprints: ['a'.repeat(64)],
    groupingRules: ['by-period'],
    versionBehavior: 'APPEND',
    periodOverlapPolicy: 'REJECT',
    duplicateKeyFields: ['invoice_id'],
    mappingPolicyId: '01GGGGGGGGGGGGGGGGGGGGGGGG',
    stabilityDebounceMs: 1500,
    publicationProjection: {
      class: 'DASHBOARD_AGGREGATES',
      fieldAllowlist: ['amount', 'period'],
    },
    ...overrides,
  };
}

function createPort(overrides: Partial<FolderBindingPort> = {}): FolderBindingPort {
  return {
    selectFolder: vi.fn(() => Promise.resolve({ selectionToken: 'sel_approved_1' })),
    resolveSelection: vi.fn((token: string) => {
      if (token === 'sel_approved_1') {
        return { canonicalPath: 'C:\\Users\\demo\\ApprovedSales' };
      }
      return Promise.resolve({ rejected: 'FOLDER_SELECTION_UNKNOWN' as const });
    }),
    assertPathInsideBinding: vi.fn((root: string, candidate: string) => {
      const normalizedRoot = root.replace(/\//g, '\\').toLowerCase();
      const normalizedCandidate = candidate.replace(/\//g, '\\').toLowerCase();
      return (
        normalizedCandidate === normalizedRoot ||
        normalizedCandidate.startsWith(`${normalizedRoot}\\`)
      );
    }),
    detectSymlinkEscape: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  };
}

function createService(
  input: {
    readonly port?: FolderBindingPort;
    readonly store?: FolderBindingStore;
    readonly nowMs?: () => number;
    readonly capabilities?: ReadonlyMap<
      string,
      {
        readonly state: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
        readonly organizationId: string;
        readonly workspaceId: string;
      }
    >;
  } = {},
) {
  const capabilities =
    input.capabilities ??
    new Map([
      [CAPABILITY, { state: 'ACTIVE' as const, organizationId: ORG, workspaceId: WORKSPACE }],
    ]);
  return new FolderManifestService({
    port: input.port ?? createPort(),
    store: input.store ?? { bindings: new Map() },
    nowMs: input.nowMs ?? (() => 1_700_000_000_000),
    resolveCapability: (capabilityGrantId) => capabilities.get(capabilityGrantId) ?? null,
  });
}

describe('DDA-012 folder binding service', () => {
  it('rejects renderer-supplied arbitrary path strings and never stores them as bindings', async () => {
    const service = createService();
    const result = await service.createBinding({
      // @ts-expect-error intentional hostile path field
      canonicalPath: 'C:\\Windows\\System32',
      selectionToken: 'sel_approved_1',
      capabilityGrantId: CAPABILITY,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Sales',
      manifest: validManifest(),
    });

    expect(result).toEqual({ accepted: false, code: 'FOLDER_REQUEST_REJECTED' });
    expect(service.listSafeStatuses()).toHaveLength(0);
  });

  it('rejects expired, revoked, and wrong-scope capabilities', async () => {
    const capabilities = new Map([
      [CAPABILITY, { state: 'EXPIRED' as const, organizationId: ORG, workspaceId: WORKSPACE }],
      [CAP_REVOKED, { state: 'REVOKED' as const, organizationId: ORG, workspaceId: WORKSPACE }],
      [
        CAP_OTHER,
        {
          state: 'ACTIVE' as const,
          organizationId: ORG_OTHER,
          workspaceId: WORKSPACE,
        },
      ],
    ]);
    const service = createService({ capabilities });

    await expect(
      service.createBinding({
        selectionToken: 'sel_approved_1',
        capabilityGrantId: CAPABILITY,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        manifest: validManifest(),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_CAPABILITY_EXPIRED' });

    await expect(
      service.createBinding({
        selectionToken: 'sel_approved_1',
        capabilityGrantId: CAP_REVOKED,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        manifest: validManifest(),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_CAPABILITY_REVOKED' });

    await expect(
      service.createBinding({
        selectionToken: 'sel_approved_1',
        capabilityGrantId: CAP_OTHER,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        manifest: validManifest(),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_CAPABILITY_WRONG_SCOPE' });
  });

  it('rejects symlink or junction escapes outside the approved root', async () => {
    const port = createPort({
      detectSymlinkEscape: vi.fn(() => Promise.resolve(true)),
    });
    const service = createService({ port });

    await expect(
      service.createBinding({
        selectionToken: 'sel_approved_1',
        capabilityGrantId: CAPABILITY,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales',
        manifest: validManifest(),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_PATH_ESCAPE' });
  });

  it('keeps canonical path local and exposes only opaque binding identity to cloud-safe status', async () => {
    const service = createService();
    const created = await service.createBinding({
      selectionToken: 'sel_approved_1',
      capabilityGrantId: CAPABILITY,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Sales Local',
      manifest: validManifest(),
    });

    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const serialized = JSON.stringify(created.value);
    expect(serialized).not.toMatch(/C:\\\\Users/i);
    expect(serialized).not.toMatch(/ApprovedSales/i);
    expect(serialized).not.toMatch(/Sales Local/);
    expect(created.value).toMatchObject({
      capabilityGrantId: CAPABILITY,
      lifecycle: 'ACTIVE',
      capabilityState: 'ACTIVE',
      manifestVersion: 1,
    });
    expect(created.value.bindingId).toMatch(/^01[0-9A-HJKMNP-TV-Z]{24}$/);
  });

  it('rejects duplicate bindings for the same canonical path and workspace', async () => {
    const service = createService();
    const first = await service.createBinding({
      selectionToken: 'sel_approved_1',
      capabilityGrantId: CAPABILITY,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      displayName: 'Sales A',
      manifest: validManifest(),
    });
    expect(first.accepted).toBe(true);

    await expect(
      service.createBinding({
        selectionToken: 'sel_approved_1',
        capabilityGrantId: CAPABILITY,
        organizationId: ORG,
        workspaceId: WORKSPACE,
        displayName: 'Sales B',
        manifest: validManifest(),
      }),
    ).resolves.toEqual({ accepted: false, code: 'FOLDER_BINDING_DUPLICATE' });
  });
});
