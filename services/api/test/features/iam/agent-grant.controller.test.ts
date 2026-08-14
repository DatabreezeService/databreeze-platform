import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { AgentGrantController } from '../../../src/features/iam/api/agent-grant.controller.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const memberId = '00000000-0000-4000-8000-000000000901';
const organizationId = '00000000-0000-4000-8000-000000000902';
const workspaceId = '00000000-0000-4000-8000-000000000903';
const actorId = '00000000-0000-4000-8000-000000000904';
const correlationId = '00000000-0000-4000-8000-000000000905';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid controller identifier');
  return parsed.value;
}

function context() {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actorId,
    correlationId,
    idempotencyKey: 'agent-grant-controller',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid controller context');
  return result.value;
}

function controller(result: unknown) {
  let status: number | undefined;
  const grants = {
    getDatasetRestrictions: () => result,
  };
  return {
    instance: new AgentGrantController(grants as never, {
      resolve: () => Promise.resolve(context()),
    }),
    reply: {
      code(value: number) {
        status = value;
        return this;
      },
    },
    status: () => status,
  };
}

void test('[IAM-024] owner restriction GET returns canonical member restrictions without client tenant authority', async () => {
  const harness = controller({
    accepted: true,
    value: {
      memberId: stable(memberId),
      deniedDatasetIds: [],
      revision: 0,
    },
  });
  const response = await harness.instance.getRestrictions(
    { headers: {} },
    memberId,
    harness.reply as never,
  );
  assert.deepEqual(response, {
    accepted: true,
    value: {
      memberId,
      deniedDatasetIds: [],
      revision: 0,
    },
  });
  assert.equal(harness.status(), 200);
});

void test('[IAM-024] restriction GET maps not-found, forbidden, and unavailable without enumeration', async () => {
  for (const [result, expectedStatus] of [
    [{ accepted: false, code: 'NOT_FOUND' }, 404],
    [{ accepted: false, code: 'SCOPE_DENIED' }, 403],
    [{ accepted: false, code: 'UNAVAILABLE' }, 503],
  ] as const) {
    const harness = controller(result);
    const response = await harness.instance.getRestrictions(
      { headers: {} },
      memberId,
      harness.reply as never,
    );
    assert.deepEqual(response, result);
    assert.equal(harness.status(), expectedStatus);
  }
});
