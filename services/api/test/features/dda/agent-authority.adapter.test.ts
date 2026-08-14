/* eslint-disable @typescript-eslint/require-await -- IAM doubles mirror the async service port. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AgentGrantAuthorizationDecisionV1,
  AgentGrantService,
} from '../../../src/features/iam/application/agent-grant.service.js';
import type { AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';

import { IamAgentAuthorityAdapter } from '../../../src/features/dda/agent/adapter/iam-agent-authority.adapter.js';
import { AgentToolRegistryV1 } from '../../../src/features/dda/agent/application/agent-tool-registry.js';
import type { AgentAuthorityInputV1 } from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const context = {
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
  },
  actorId: '00000000-0000-0000-0000-000000000003',
  correlationId: '00000000-0000-0000-0000-000000000004',
  idempotencyKey: 'agent-authority-test',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
} as IamTenantContextV1;

const datasetId = '00000000-0000-0000-0000-000000000005';
const restrictedDatasetId = '00000000-0000-0000-0000-000000000006';

function decision(
  requestedLevel: AgentGrantLevelV1,
  overrides: Partial<AgentGrantAuthorizationDecisionV1> = {},
): AgentGrantAuthorizationDecisionV1 {
  return {
    effectiveLevel: requestedLevel,
    allowed: true,
    canMutateDatasets: true,
    requiresConfirmation: false,
    accessPreset: 'EDITOR',
    deniedDatasetIds: [],
    ...overrides,
  };
}

function request(overrides: Partial<AgentAuthorityInputV1> = {}): AgentAuthorityInputV1 {
  return {
    context,
    datasetIds: [],
    ...overrides,
  };
}

void test('[IAM-024][IAM-025][DDA-060] IAM adapter derives member, level, confirmation, and resources from trusted inputs', async () => {
  const calls: Parameters<AgentGrantService['authorize']>[0][] = [];
  const grants = {
    async authorize(input: Parameters<AgentGrantService['authorize']>[0]) {
      calls.push(input);
      return {
        accepted: true as const,
        value: decision(input.requestedLevel as AgentGrantLevelV1),
      };
    },
  } as unknown as AgentGrantService;
  const registry = new AgentToolRegistryV1();
  const descriptorResult = registry.resolve('dashboard.applyConfirmed');
  assert.equal(descriptorResult.accepted, true);
  if (!descriptorResult.accepted) return;

  const adapter = new IamAgentAuthorityAdapter(grants);
  const result = await adapter.authorize(
    request({
      descriptor: descriptorResult.value,
      datasetIds: [datasetId],
      input: { previewCommandId: 'preview-1', userConfirmation: true },
      confirmationPresent: true,
    }),
  );

  assert.deepEqual(result, {
    allowed: true,
    effectiveAgentLevel: 'APPLY_CONFIRMED_CHANGES',
    accessPreset: 'EDITOR',
    deniedDatasetIds: [],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.memberId, context.actorId);
  assert.equal(calls[0]?.requestedLevel, 'APPLY_CONFIRMED_CHANGES');
  assert.deepEqual(calls[0]?.resourceIds, [datasetId]);
  assert.equal(calls[0]?.confirmationPresent, true);
});

void test('[IAM-024][DDA-060] IAM adapter returns server-owned denied dataset restrictions', async () => {
  let calls = 0;
  const grants = {
    async authorize(input: Parameters<AgentGrantService['authorize']>[0]) {
      calls += 1;
      return {
        accepted: true as const,
        value: decision(input.requestedLevel as AgentGrantLevelV1, {
          deniedDatasetIds: [restrictedDatasetId as never],
        }),
      };
    },
  } as unknown as AgentGrantService;
  const adapter = new IamAgentAuthorityAdapter(grants);

  const result = await adapter.authorize(request({ datasetIds: [restrictedDatasetId] }));

  assert.deepEqual(result, { allowed: false, code: 'DATASET_RESTRICTED' });
  assert.equal(calls, 1);
});

void test('[IAM-024][DDA-060] IAM adapter maps insufficient level and confirmation denial', async () => {
  const grants = {
    async authorize(input: Parameters<AgentGrantService['authorize']>[0]) {
      const requestedLevel = input.requestedLevel as AgentGrantLevelV1;
      return {
        accepted: true as const,
        value: decision(requestedLevel, {
          effectiveLevel: 'ANALYZE',
          allowed: false,
          requiresConfirmation: requestedLevel === 'APPLY_CONFIRMED_CHANGES',
        }),
      };
    },
  } as unknown as AgentGrantService;
  const registry = new AgentToolRegistryV1();
  const apply = registry.resolve('dashboard.applyConfirmed');
  assert.equal(apply.accepted, true);
  if (!apply.accepted) return;
  const adapter = new IamAgentAuthorityAdapter(grants);

  const insufficient = await adapter.authorize(request({ descriptor: apply.value }));
  assert.deepEqual(insufficient, { allowed: false, code: 'UNCONFIRMED_DASHBOARD_APPLY' });

  const noneGrants = {
    async authorize(input: Parameters<AgentGrantService['authorize']>[0]) {
      return {
        accepted: true as const,
        value: decision(input.requestedLevel as AgentGrantLevelV1, {
          effectiveLevel: 'NONE',
          allowed: false,
        }),
      };
    },
  } as unknown as AgentGrantService;
  const noneResult = await new IamAgentAuthorityAdapter(noneGrants).authorize(request());
  assert.deepEqual(noneResult, { allowed: false, code: 'INSUFFICIENT_AGENT_LEVEL' });
});

void test('[IAM-024][DDA-060] IAM adapter fails closed on IAM errors and restricted lookups', async () => {
  const unavailable = new IamAgentAuthorityAdapter({
    async authorize() {
      throw new Error('database unavailable');
    },
  } as unknown as AgentGrantService);
  assert.deepEqual(await unavailable.authorize(request()), {
    allowed: false,
    code: 'UNAUTHORIZED',
  });

  let calls = 0;
  const notFound = new IamAgentAuthorityAdapter({
    async authorize() {
      calls += 1;
      return { accepted: false as const, code: 'NOT_FOUND' as const };
    },
  } as unknown as AgentGrantService);
  assert.deepEqual(await notFound.authorize(request({ datasetIds: [datasetId] })), {
    allowed: false,
    code: 'DATASET_RESTRICTED',
  });
  assert.equal(calls, 1);
});
