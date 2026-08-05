import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOLDER_AUTOPILOT_SCHEMA_VERSION_V1,
  applyFolderAutopilotPreviewV1,
  createFolderAutopilotRecipeV1,
  previewFolderAutopilotRecipeV1,
} from '@databreeze/domain/folder-autopilot/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
};
const hash = 'a'.repeat(64);

function recipeInput(overrides = {}) {
  return {
    recipeId: '00000000-0000-4000-8000-000000000010',
    tenantScope: scope,
    version: 1,
    name: 'Invoice routing',
    filter: { extensions: ['xlsx'] },
    steps: [
      {
        stepId: '00000000-0000-4000-8000-000000000011',
        action: 'MOVE',
        destinationTemplate: 'processed/{{name}}',
        approvalRequired: true,
      },
    ],
    inputDeviceGrantId: '00000000-0000-4000-8000-000000000012',
    outputDeviceGrantId: '00000000-0000-4000-8000-000000000013',
    capabilityDigest: hash,
    recipeHash: hash,
    ...overrides,
  };
}

void test('[FA-001, FA-005, FA-014] creates an immutable, scoped, approval-aware recipe', () => {
  const result = createFolderAutopilotRecipeV1(recipeInput());
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.schemaVersion, FOLDER_AUTOPILOT_SCHEMA_VERSION_V1);
  assert.equal(result.value.tenantScope.scopeType, 'workspace');
  assert.equal(result.value.state, 'DRAFT');
  assert.equal(Object.isFrozen(result.value.steps), true);
  assert.equal(Object.isFrozen(result.value), true);
});

void test('[FA-006, FA-009, FA-019] previews only relative, allowlisted operations and does not touch files', () => {
  const recipe = createFolderAutopilotRecipeV1(recipeInput());
  assert.equal(recipe.accepted, true);
  if (!recipe.accepted) return;
  const files = [
    { fileId: 'file-1', relativePath: 'incoming/invoice.xlsx', sizeBytes: 42, contentSha256: hash },
    { fileId: 'file-2', relativePath: 'incoming/readme.txt', sizeBytes: 4, contentSha256: hash },
  ];
  const preview = previewFolderAutopilotRecipeV1(recipe.value, files);
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  assert.equal(preview.value.operations.length, 1);
  assert.equal(preview.value.operations[0]?.destination, 'processed/invoice.xlsx');
  assert.deepEqual(preview.value.skippedFileIds, ['file-2']);
  assert.equal(preview.value.requiresApproval, true);
  assert.deepEqual(files[0], {
    fileId: 'file-1',
    relativePath: 'incoming/invoice.xlsx',
    sizeBytes: 42,
    contentSha256: hash,
  });
});

void test('[FA-015, FA-016] applies only after approval and fails closed on changed source', () => {
  const recipe = createFolderAutopilotRecipeV1(recipeInput());
  assert.equal(recipe.accepted, true);
  if (!recipe.accepted) return;
  const preview = previewFolderAutopilotRecipeV1(recipe.value, [
    { fileId: 'file-1', relativePath: 'incoming/invoice.xlsx', sizeBytes: 42, contentSha256: hash },
  ]);
  assert.equal(preview.accepted, true);
  if (!preview.accepted) return;
  const blocked = applyFolderAutopilotPreviewV1(preview.value, {
    'incoming/invoice.xlsx': {
      fileId: 'file-1',
      relativePath: 'incoming/invoice.xlsx',
      sizeBytes: 42,
      contentSha256: hash,
    },
  });
  assert.equal(blocked.status, 'BLOCKED');
  const changed = applyFolderAutopilotPreviewV1(
    preview.value,
    {
      'incoming/invoice.xlsx': {
        fileId: 'file-1',
        relativePath: 'incoming/invoice.xlsx',
        sizeBytes: 43,
        contentSha256: 'b'.repeat(64),
      },
    },
    { approvalGranted: true },
  );
  assert.equal(changed.status, 'FAILED');
  assert.ok(changed.errors.some((error) => error.startsWith('SOURCE_CHANGED:')));
});
