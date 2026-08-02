import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryRecipeRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-recipe-repository.adapter.js';
import { RecipeService } from '../../../src/features/jra/application/recipe.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const recipeId = '00000000-0000-4000-8000-000000000004';
const triggerId = '00000000-0000-4000-8000-000000000005';
const actorId = '00000000-0000-4000-8000-000000000006';
const correlationId = '00000000-0000-4000-8000-000000000007';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const ids = {
  organizationId: stable(organizationId),
  workspaceId: stable(workspaceId),
  siblingWorkspaceId: stable(siblingWorkspaceId),
  recipeId: stable(recipeId),
  triggerId: stable(triggerId),
  actorId: stable(actorId),
  correlationId: stable(correlationId),
};

const action = {
  schemaVersion: 1 as const,
  actionType: 'spreadsheet.audit',
  version: 1,
  inputSchemaId: 'schema.input.v1',
  outputSchemaId: 'schema.output.v1',
  handlerDigest: 'a'.repeat(64),
  requiredCapabilities: ['artifact.read'],
  sideEffectClass: 'NONE' as const,
  riskClass: 'READ_ONLY' as const,
  defaultTimeoutSeconds: 60,
  maxAttempts: 3,
  approvalClass: 'NONE' as const,
};

function context(workspace: typeof ids.workspaceId, key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: workspace,
    },
    actorId: ids.actorId,
    correlationId: ids.correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function recipeInput() {
  return {
    recipeId: ids.recipeId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    version: 1,
    name: 'Spreadsheet audit',
    actionDefinitions: [action],
    recipeHash: 'b'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function envelopeInput() {
  return {
    recipeId: ids.recipeId,
    recipeVersion: 1,
    recipeHash: 'b'.repeat(64),
    actionHandlerDigests: ['a'.repeat(64)],
    actionSchemaIds: ['schema.input.v1'],
    dsmDefinitionHashes: ['c'.repeat(64)],
    policyReferenceHashes: ['d'.repeat(64)],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-01-02T00:00:00.000Z',
    signerKeyVersion: 'key-1',
    signature: 'signature',
  };
}

void test('[JRA-003, JRA-004, JRA-015, JRA-030] service publishes recipes, triggers, and envelopes idempotently', async () => {
  const service = new RecipeService(new InMemoryRecipeRepositoryAdapter());
  const created = await service.createVersion(context(ids.workspaceId, 'create'), recipeInput());
  assert.equal(created.accepted, true);
  const published = await service.publishVersion(
    context(ids.workspaceId, 'publish'),
    ids.recipeId,
    1,
    '2026-01-01T00:01:00.000Z',
  );
  assert.equal(published.accepted, true);
  const trigger = await service.registerTrigger(context(ids.workspaceId, 'trigger'), {
    triggerId: ids.triggerId,
    recipeId: ids.recipeId,
    recipeVersion: 1,
    tenantScope: recipeInput().tenantScope,
    triggerType: 'MANUAL',
    deduplicationKey: 'manual',
    authorizationContextHash: 'e'.repeat(64),
    enabled: true,
  });
  assert.equal(trigger.accepted, true);
  const envelope = await service.publishEnvelope(
    context(ids.workspaceId, 'envelope'),
    envelopeInput(),
  );
  assert.equal(envelope.accepted, true);
  if (envelope.accepted)
    assert.deepEqual(
      await service.publishEnvelope(context(ids.workspaceId, 'replay'), envelopeInput()),
      envelope,
    );
});

void test('[IAM-009, JRA-003] sibling workspaces cannot publish or read another recipe', async () => {
  const service = new RecipeService(new InMemoryRecipeRepositoryAdapter());
  await service.createVersion(context(ids.workspaceId, 'scope-create'), recipeInput());
  assert.deepEqual(
    await service.publishVersion(
      context(ids.siblingWorkspaceId, 'scope-publish'),
      ids.recipeId,
      1,
      '2026-01-01T00:01:00.000Z',
    ),
    { accepted: false, code: 'INVALID_IDENTIFIER' },
  );
});
