import assert from 'node:assert/strict';
import test from 'node:test';

import * as api from '../dist/recipe/v1.js';

const ids = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  recipeId: '00000000-0000-4000-8000-000000000003',
  triggerId: '00000000-0000-4000-8000-000000000004',
};

const action = {
  schemaVersion: 1,
  actionType: 'spreadsheet.audit',
  version: 1,
  inputSchemaId: 'schema.input.v1',
  outputSchemaId: 'schema.output.v1',
  handlerDigest: 'a'.repeat(64),
  requiredCapabilities: ['artifact.read'],
  sideEffectClass: 'NONE',
  riskClass: 'READ_ONLY',
  defaultTimeoutSeconds: 60,
  maxAttempts: 3,
  approvalClass: 'NONE',
};

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

void test('[JRA-003, JRA-004, JRA-030] recipe publication is immutable and envelope-bound', () => {
  const draft = api.createRecipeVersionV1(recipeInput());
  assert.equal(draft.accepted, true);
  if (!draft.accepted) return;
  const published = api.publishRecipeVersionV1(draft.value, '2026-01-01T00:01:00.000Z');
  assert.equal(published.accepted, true);
  if (published.accepted) assert.equal(published.value.state, 'PUBLISHED');
  const envelope = api.createRecipePublicationEnvelopeV1({
    recipeId: ids.recipeId,
    recipeVersion: 1,
    recipeHash: 'b'.repeat(64),
    actionHandlerDigests: ['a'.repeat(64)],
    actionSchemaIds: ['schema.input.v1', 'schema.output.v1'],
    dsmDefinitionHashes: ['c'.repeat(64)],
    policyReferenceHashes: ['d'.repeat(64)],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2026-01-02T00:00:00.000Z',
    signerKeyVersion: 'key-1',
    signature: 'signature',
  });
  assert.equal(envelope.accepted, true);
});

void test('[JRA-003, JRA-015, JRA-030] invalid recipes, triggers, and expired windows fail closed', () => {
  assert.deepEqual(api.createRecipeVersionV1({ ...recipeInput(), actionDefinitions: [] }), {
    accepted: false,
    code: 'INVALID_ACTIONS',
  });
  assert.deepEqual(
    api.createRecipeTriggerV1({
      triggerId: ids.triggerId,
      recipeId: ids.recipeId,
      recipeVersion: 1,
      tenantScope: recipeInput().tenantScope,
      triggerType: 'UNKNOWN',
      deduplicationKey: 'trigger',
      authorizationContextHash: 'a'.repeat(64),
      enabled: true,
    }),
    { accepted: false, code: 'INVALID_TRIGGER' },
  );
  assert.deepEqual(
    api.createRecipePublicationEnvelopeV1({
      recipeId: ids.recipeId,
      recipeVersion: 1,
      recipeHash: 'b'.repeat(64),
      actionHandlerDigests: ['a'.repeat(64)],
      actionSchemaIds: ['schema.v1'],
      dsmDefinitionHashes: [],
      policyReferenceHashes: [],
      validFrom: '2026-01-02T00:00:00.000Z',
      validUntil: '2026-01-01T00:00:00.000Z',
      signerKeyVersion: 'key-1',
      signature: 'signature',
    }),
    { accepted: false, code: 'INVALID_WINDOW' },
  );
});
