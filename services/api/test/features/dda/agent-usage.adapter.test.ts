/* eslint-disable @typescript-eslint/require-await -- BUA doubles mirror the async admission port. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type { EntitlementAdmissionInputV1 } from '../../../src/features/bua/application/entitlement-admission.service.js';
import type { EntitlementAdmissionService } from '../../../src/features/bua/application/entitlement-admission.service.js';
import { BuaAgentUsageAdapter } from '../../../src/features/dda/agent/adapter/bua-agent-usage.adapter.js';
import type { AgentUsageAdmissionResolverPortV1 } from '../../../src/features/dda/agent/adapter/bua-agent-usage.adapter.js';
import type { AgentUsageAdmissionInputV1 } from '../../../src/features/dda/agent/application/agent-runtime.port.js';
import type { AgentToolDescriptorV1 } from '../../../src/features/dda/agent/application/agent-tool.types.js';
import type { IamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const context = {
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
  },
  actorId: '00000000-0000-0000-0000-000000000003',
  correlationId: '00000000-0000-0000-0000-000000000004',
  idempotencyKey: 'request-idempotency',
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
} as IamTenantContextV1;

const descriptor = {
  name: 'dataset.sample',
  requiredAgentLevel: 'ANALYZE',
  requiredIamAction: PERMISSIONS_V1.ARTIFACT_RECORD_READ,
  inputSchema: { schemaId: 'input', properties: [], requiredProperties: [] },
  outputSchema: { schemaId: 'output', properties: [], requiredProperties: [] },
  maximumRows: 50,
  maximumBytes: 1024,
  costClass: 'LOW',
  sideEffectClass: 'READ',
  timeoutMs: 1000,
  auditPolicy: 'REQUIRED',
  requiresUserConfirmation: false,
} as AgentToolDescriptorV1;

const input: AgentUsageAdmissionInputV1 = {
  context,
  descriptor,
  costClass: 'LOW',
  correlationId: 'request-idempotency:tool:call-1',
};

const resolution = {
  snapshotId: '00000000-0000-0000-0000-000000000010',
  feature: 'DDA_AGENT_DATASET_SAMPLE',
  reservationId: '00000000-0000-0000-0000-000000000011',
  entryId: '00000000-0000-0000-0000-000000000012',
  metric: 'agent_tool_units',
  requestedUnits: 1,
};

void test('[BUA-005][BUA-008][DDA-060] BUA adapter uses only a server-owned admission resolution', async () => {
  const resolverInputs: AgentUsageAdmissionInputV1[] = [];
  const admissionInputs: { context: IamTenantContextV1; input: EntitlementAdmissionInputV1 }[] = [];
  const resolver: AgentUsageAdmissionResolverPortV1 = {
    async resolve(value) {
      resolverInputs.push(value);
      return resolution;
    },
  };
  const admission = {
    async admit(admissionContext: IamTenantContextV1, admissionInput: EntitlementAdmissionInputV1) {
      admissionInputs.push({ context: admissionContext, input: admissionInput });
      return { accepted: true as const, value: {} };
    },
  } as unknown as EntitlementAdmissionService;
  const adapter = new BuaAgentUsageAdapter(admission, resolver, () => '2026-08-13T00:00:00.000Z');

  const result = await adapter.admit(input);

  assert.deepEqual(result, { allowed: true });
  assert.deepEqual(resolverInputs, [input]);
  assert.equal(admissionInputs.length, 1);
  assert.equal(admissionInputs[0]?.context, context);
  assert.deepEqual(admissionInputs[0]?.input, {
    ...resolution,
    tenantScope: context.tenantScope,
    idempotencyKey: input.correlationId,
    now: '2026-08-13T00:00:00.000Z',
  });
});

void test('[BUA-005][DDA-060] BUA adapter denies when the server-owned resolver has no entitlement mapping', async () => {
  let admissionCalled = false;
  const resolver: AgentUsageAdmissionResolverPortV1 = {
    async resolve() {
      return undefined;
    },
  };
  const admission = {
    async admit() {
      admissionCalled = true;
      return { accepted: true as const, value: {} };
    },
  } as unknown as EntitlementAdmissionService;

  const result = await new BuaAgentUsageAdapter(admission, resolver).admit(input);

  assert.deepEqual(result, { allowed: false, code: 'BUDGET_DENIED' });
  assert.equal(admissionCalled, false);
});

void test('[BUA-005][BUA-008][DDA-060] BUA adapter fails closed for denied or unavailable admission', async () => {
  const resolver: AgentUsageAdmissionResolverPortV1 = {
    async resolve() {
      return resolution;
    },
  };
  const denied = {
    async admit() {
      return { accepted: false as const, code: 'ENTITLEMENT_NOT_FOUND' as const };
    },
  } as unknown as EntitlementAdmissionService;
  const unavailable = {
    async admit() {
      throw new Error('BUA unavailable');
    },
  } as unknown as EntitlementAdmissionService;

  assert.deepEqual(await new BuaAgentUsageAdapter(denied, resolver).admit(input), {
    allowed: false,
    code: 'BUDGET_DENIED',
  });
  assert.deepEqual(await new BuaAgentUsageAdapter(unavailable, resolver).admit(input), {
    allowed: false,
    code: 'BUDGET_DENIED',
  });
});
