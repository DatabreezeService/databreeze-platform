import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await -- deterministic authority doubles. */

import { createDataModePolicyVersionV1 } from '@databreeze/domain/data-mode/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import { DsoWorkspacePolicyAuthorityAdapter } from '../../src/platform/dso-workspace-policy.composition.js';

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid fixture id');
  return parsed.value;
}

const ids = {
  organization: id('00000000-0000-4000-8000-000000000101'),
  workspace: id('00000000-0000-4000-8000-000000000102'),
  otherWorkspace: id('00000000-0000-4000-8000-000000000103'),
  policy: id('00000000-0000-4000-8000-000000000104'),
  version: id('00000000-0000-4000-8000-000000000105'),
};

function policy(mode: 'LOCAL' | 'HYBRID' | 'CLOUD' = 'HYBRID') {
  const parsed = createDataModePolicyVersionV1({
    policyId: ids.policy,
    policyVersionId: ids.version,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    revision: 3,
    mode,
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      INTERNAL: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: mode === 'LOCAL' ? ['LOCAL'] : ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: mode === 'LOCAL' ? ['DESKTOP'] : ['CLOUD', 'DESKTOP'],
    allowedDestinationClasses: ['DESKTOP', 'WEB'],
    canonicalHash: 'a'.repeat(64),
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
  if (!parsed.accepted) throw new Error('invalid fixture');
  return parsed.value;
}

function fixture(
  overrides: {
    readonly dsoWorkspaceId?: StableIdentifierV1;
    readonly iamVersionId?: StableIdentifierV1;
    readonly iamEpoch?: number;
    readonly iamMode?: 'LOCAL' | 'HYBRID' | 'CLOUD';
    readonly version?: ReturnType<typeof policy> | undefined;
  } = {},
) {
  const current = policy();
  return new DsoWorkspacePolicyAuthorityAdapter(
    {
      resolveCurrent: async () => ({
        organizationId: ids.organization,
        workspaceId: overrides.dsoWorkspaceId ?? ids.workspace,
        policyId: ids.policy,
        currentPolicyVersionId: ids.version,
        currentPolicyVersionHash: current.canonicalHash,
        aggregateRevision: 3,
      }),
    },
    {
      findExact: async () => (Object.hasOwn(overrides, 'version') ? overrides.version : current),
    },
    {
      resolveExact: async () => ({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        dataModePolicyId: ids.policy,
        currentDataModePolicyVersionId: overrides.iamVersionId ?? ids.version,
        dataModeProjection: overrides.iamMode ?? 'HYBRID',
        authorizationEpoch: overrides.iamEpoch ?? 7,
      }),
    },
  );
}

void test('[DSO-024/026/027][IAM-019] root returns one exact current policy and live epoch', async () => {
  const result = await fixture().resolveCurrentWorkspacePolicy({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
  });

  assert.equal(result?.policy.policyVersionId, ids.version);
  assert.equal(result?.authorizationEpoch, 7);
});

void test('[DSO-026][IAM-003/019] root fails closed for stale or cross-tenant bindings', async () => {
  const cases = [
    fixture({ dsoWorkspaceId: ids.otherWorkspace }),
    fixture({ iamVersionId: id('00000000-0000-4000-8000-000000000199') }),
    fixture({ iamEpoch: 0 }),
    fixture({ iamMode: 'LOCAL' }),
    fixture({ version: undefined }),
  ];

  for (const authority of cases) {
    assert.equal(
      await authority.resolveCurrentWorkspacePolicy({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
      }),
      undefined,
    );
  }
});

void test('[DSO-026] dependency failures never select a fallback or latest policy', async () => {
  const authority = new DsoWorkspacePolicyAuthorityAdapter(
    { resolveCurrent: async () => Promise.reject(new Error('database unavailable')) },
    { findExact: async () => policy() },
    {
      resolveExact: async () => ({
        organizationId: ids.organization,
        workspaceId: ids.workspace,
        dataModePolicyId: ids.policy,
        currentDataModePolicyVersionId: ids.version,
        dataModeProjection: 'HYBRID',
        authorizationEpoch: 7,
      }),
    },
  );

  assert.equal(
    await authority.resolveCurrentWorkspacePolicy({
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    }),
    undefined,
  );
});
