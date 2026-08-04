import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Partial foundation coverage: IAM-001, IAM-019, AUD-004, AUD-006,
// INT-004, INT-005, INT-008, and INT-021.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(packageRoot, 'manifest.json');
const schemaBase = 'https://schemas.databreeze.dev/contracts/v1';

const ids = {
  actorMetadata: `${schemaBase}/actor-metadata`,
  autopilotFolderBinding: `${schemaBase}/autopilot-folder-binding`,
  commandEnvelope: `${schemaBase}/command-envelope`,
  correlationMetadata: `${schemaBase}/correlation-metadata`,
  cursorPage: `${schemaBase}/cursor-page`,
  eventEnvelope: `${schemaBase}/event-envelope`,
  folderAutopilotProfile: `${schemaBase}/folder-autopilot-profile`,
  identifier: `${schemaBase}/identifier`,
  problemDetails: `${schemaBase}/problem-details`,
  recipeAssignment: `${schemaBase}/recipe-assignment`,
  revision: `${schemaBase}/revision`,
  tenantScope: `${schemaBase}/tenant-scope`,
  utcTimestamp: `${schemaBase}/utc-timestamp`,
};

const organizationId = '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc01';
const workspaceId = '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc02';
const projectId = '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc03';
const actorId = '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc04';
const correlationId = '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc05';

function loadContracts() {
  assert.equal(existsSync(manifestPath), true, 'canonical schema manifest must exist');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const schemas = manifest.schemas.map((entry) => {
    const schemaPath = resolve(packageRoot, entry.path);
    assert.equal(existsSync(schemaPath), true, `schema source must exist: ${entry.path}`);
    return JSON.parse(readFileSync(schemaPath, 'utf8'));
  });

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }

  return { ajv, manifest, schemas };
}

function validatorFor(id) {
  const { ajv } = loadContracts();
  const validate = ajv.getSchema(id);
  assert.ok(validate, `manifest must register ${id}`);
  return validate;
}

test('publishes the complete deterministic v1 registry and compiles every real schema', () => {
  const { ajv, manifest, schemas } = loadContracts();
  const expectedNames = [
    'actor-metadata',
    'autopilot-folder-binding',
    'command-envelope',
    'correlation-metadata',
    'cursor-page',
    'event-envelope',
    'folder-autopilot-profile',
    'identifier',
    'problem-details',
    'recipe-assignment',
    'revision',
    'tenant-scope',
    'utc-timestamp',
  ];

  assert.equal(manifest.draft, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    manifest.schemas.map((entry) => entry.name),
    expectedNames,
  );
  assert.deepEqual(
    manifest.schemas.map((entry) => entry.id),
    expectedNames.map((name) => `${schemaBase}/${name}`),
  );
  assert.deepEqual(
    schemas.map((schema) => schema.$id),
    manifest.schemas.map((entry) => entry.id),
  );

  for (const entry of manifest.schemas) {
    assert.ok(ajv.getSchema(entry.id), `schema must compile: ${entry.name}`);
  }
});

test('exports only declared registry schema and generated TypeScript entry points', () => {
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

  assert.deepEqual(Object.keys(packageJson.exports), [
    '.',
    './v1',
    './v1/actor-metadata',
    './v1/autopilot-folder-binding',
    './v1/command-envelope',
    './v1/correlation-metadata',
    './v1/cursor-page',
    './v1/event-envelope',
    './v1/folder-autopilot-profile',
    './v1/identifier',
    './v1/problem-details',
    './v1/recipe-assignment',
    './v1/revision',
    './v1/tenant-scope',
    './v1/utc-timestamp',
  ]);
  for (const target of Object.values(packageJson.exports)) {
    const paths = typeof target === 'string' ? [target] : Object.values(target);
    for (const path of paths) {
      assert.equal(
        existsSync(resolve(packageRoot, path)),
        true,
        `export target must exist: ${path}`,
      );
    }
  }
});

test('rejects a malformed UUID identifier', () => {
  const validate = validatorFor(ids.identifier);

  assert.equal(validate('not-a-uuid'), false);
  assert.equal(validate(organizationId), true);
});

test('rejects a timestamp that is not expressed with UTC Z', () => {
  const validate = validatorFor(ids.utcTimestamp);

  assert.equal(validate('2026-08-01T08:30:00+07:00'), false);
  assert.equal(validate('2026-08-01T01:30:00.125Z'), true);
});

test('accepts only positive entity revisions', () => {
  const validate = validatorFor(ids.revision);

  assert.equal(validate(0), false);
  assert.equal(validate(1), true);
});

test('accepts explicit organization, workspace, and project tenant ancestry', () => {
  const validate = validatorFor(ids.tenantScope);

  assert.equal(validate({ scopeType: 'organization', organizationId }), true);
  assert.equal(validate({ scopeType: 'workspace', organizationId, workspaceId }), true);
  assert.equal(validate({ scopeType: 'project', organizationId, workspaceId, projectId }), true);
});

test('rejects incomplete or discriminator-mismatched tenant ancestry', () => {
  const validate = validatorFor(ids.tenantScope);

  assert.equal(validate({ scopeType: 'project', organizationId, projectId }), false);
  assert.equal(validate({ scopeType: 'workspace', organizationId, workspaceId, projectId }), false);
});

test('[FA-001..FA-007, FA-014, FA-015, FA-031] compiles closed profile, binding, and assignment contracts', () => {
  const profile = {
    schemaVersion: 1,
    profileId: organizationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    version: 1,
    payloadHash: 'a'.repeat(64),
    stabilizationDelayMs: 1000,
    maxFilesPerScan: 100,
    collisionPolicy: 'REVIEW',
    undoWindowSeconds: 3600,
    outputLineageEnabled: true,
    createdAt: '2026-08-01T01:30:00.125Z',
    revision: 1,
  };
  const binding = {
    schemaVersion: 1,
    bindingId: actorId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    deviceGrantId: projectId,
    role: 'INPUT',
    expectedCapabilityDigest: 'b'.repeat(64),
    createdAt: '2026-08-01T01:30:00.125Z',
    revision: 1,
  };
  const assignment = {
    schemaVersion: 1,
    assignmentId: correlationId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    profileId: organizationId,
    profileVersion: 1,
    profileHash: 'a'.repeat(64),
    jraRecipeVersionId: projectId,
    jraRecipeVersionHash: 'c'.repeat(64),
    deviceId: actorId,
    inputBindingIds: [actorId],
    outputBindingIds: [projectId],
    dataModeConstraint: 'LOCAL',
    effectiveDataModePolicyRef: correlationId,
    idempotencyKey: 'assignment-1',
    state: 'DRAFT',
    revision: 1,
    createdAt: '2026-08-01T01:30:00.125Z',
  };
  assert.equal(validatorFor(ids.folderAutopilotProfile)(profile), true);
  assert.equal(validatorFor(ids.autopilotFolderBinding)(binding), true);
  assert.equal(validatorFor(ids.recipeAssignment)(assignment), true);
  assert.equal(validatorFor(ids.autopilotFolderBinding)({ ...binding, path: 'C:\\secret' }), false);
  assert.equal(validatorFor(ids.recipeAssignment)({ ...assignment, localHandle: 'secret' }), false);
});

test('accepts closed correlation metadata and rejects undeclared context', () => {
  const validate = validatorFor(ids.correlationMetadata);

  assert.equal(validate({ correlationId }), true);
  assert.equal(validate({ correlationId, customerEmail: 'sensitive@example.test' }), false);
});

test('rejects RFC problem details with an invalid HTTP status', () => {
  const validate = validatorFor(ids.problemDetails);
  const problem = {
    type: 'https://api.databreeze.dev/problems/validation-failed',
    title: 'Request validation failed',
    status: 422,
    detail: 'One or more request fields are invalid.',
    instance: '/requests/018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc09',
    code: 'VALIDATION_FAILED',
    correlationId,
    retryable: false,
    messageKey: 'errors.validationFailed',
    fieldErrors: [{ field: 'name', code: 'REQUIRED' }],
  };

  assert.equal(validate(problem), true);
  assert.equal(validate({ ...problem, status: 99 }), false);
  assert.equal(validate({ ...problem, status: 600 }), false);
});

test('accepts the documented Web problem shape with title localization and revision recovery', () => {
  const validate = validatorFor(ids.problemDetails);
  const webProblem = {
    type: 'https://api.databreeze.dev/problems/revision-conflict',
    titleKey: 'errors.revisionConflict.title',
    status: 409,
    code: 'REVISION_CONFLICT',
    correlationId,
    retryable: false,
    currentRevision: 7,
    remediationAction: 'refresh-and-retry',
  };

  assert.equal(validate(webProblem), true);
});

test('accepts the documented rate-limit problem shape with message localization', () => {
  const validate = validatorFor(ids.problemDetails);
  const rateLimitProblem = {
    type: 'https://api.databreeze.dev/problems/rate-limit-exceeded',
    messageKey: 'errors.rateLimitExceeded',
    status: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    correlationId,
    retryable: true,
    retryAfterSeconds: 30,
    rateLimit: {
      scope: 'principal',
      limit: 100,
      remaining: 0,
      resetAt: '2026-08-01T01:31:00Z',
    },
  };

  assert.equal(validate(rateLimitProblem), true);
});

test('requires at least one problem localization key', () => {
  const validate = validatorFor(ids.problemDetails);
  const problem = {
    type: 'https://api.databreeze.dev/problems/access-denied',
    status: 403,
    code: 'ACCESS_DENIED',
    correlationId,
    retryable: false,
  };

  assert.equal(validate(problem), false);
});

test('rejects unknown outer and nested problem fields', () => {
  const validate = validatorFor(ids.problemDetails);
  const problem = {
    type: 'https://api.databreeze.dev/problems/access-denied',
    status: 403,
    code: 'ACCESS_DENIED',
    correlationId,
    retryable: false,
  };

  assert.equal(validate({ ...problem, titleKey: 'errors.accessDenied', stack: 'secret' }), false);
  assert.equal(
    validate({
      ...problem,
      messageKey: 'errors.accessDenied',
      rateLimit: {
        scope: 'principal',
        resetAt: '2026-08-01T01:31:00Z',
        credential: 'secret',
      },
    }),
    false,
  );
});

test('rejects a command envelope with no idempotency key', () => {
  const validate = validatorFor(ids.commandEnvelope);
  const command = {
    commandId: '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc06',
    commandType: 'iam.workspace.rename',
    schemaVersion: 1,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    actor: { actorType: 'user', actorId },
    correlation: { correlationId },
    issuedAt: '2026-08-01T01:30:00.125Z',
    idempotencyKey: 'rename-workspace-018f47f2',
    data: { displayName: 'Operations' },
  };

  assert.equal(validate(command), true);
  const withoutIdempotency = { ...command };
  delete withoutIdempotency.idempotencyKey;
  assert.equal(validate(withoutIdempotency), false);
});

test('accepts the authoritative continuing and terminal cursor page shapes', () => {
  const validate = validatorFor(ids.cursorPage);

  assert.equal(
    validate({
      data: [{ id: workspaceId }],
      nextCursor: 'opaque-cursor',
      snapshotAt: '2026-08-01T01:30:00Z',
      hasMore: true,
    }),
    true,
  );
  assert.equal(validate({ data: [], snapshotAt: '2026-08-01T01:30:00Z', hasMore: false }), true);
});

test('requires a continuation cursor only while more data exists', () => {
  const validate = validatorFor(ids.cursorPage);

  assert.equal(validate({ data: [], snapshotAt: '2026-08-01T01:30:00Z', hasMore: true }), false);
  assert.equal(
    validate({
      data: [],
      nextCursor: 'stale-cursor',
      snapshotAt: '2026-08-01T01:30:00Z',
      hasMore: false,
    }),
    false,
  );
});

test('rejects a cursor page with a non-UTC snapshot', () => {
  const validate = validatorFor(ids.cursorPage);

  assert.equal(
    validate({ data: [], snapshotAt: '2026-08-01T08:30:00+07:00', hasMore: false }),
    false,
  );
});

test('rejects unknown cursor page fields', () => {
  const validate = validatorFor(ids.cursorPage);

  assert.equal(
    validate({
      data: [],
      snapshotAt: '2026-08-01T01:30:00Z',
      hasMore: false,
      pageInfo: {},
    }),
    false,
  );
});

test('requires event type and positive entity revision in the canonical event envelope', () => {
  const validate = validatorFor(ids.eventEnvelope);
  const event = {
    eventId: '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc07',
    eventType: 'iam.workspace.renamed',
    schemaVersion: 1,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    entity: { entityType: 'workspace', entityId: workspaceId, revision: 2 },
    actor: { actorType: 'user', actorId },
    correlation: { correlationId },
    sourceComponent: 'iam',
    occurredAt: '2026-08-01T01:30:00.125Z',
    data: { changedFields: ['displayName'] },
  };

  assert.equal(validate(event), true);
  const withoutEventType = { ...event };
  delete withoutEventType.eventType;
  assert.equal(validate(withoutEventType), false);
  assert.equal(
    validate({ ...event, entity: { entityType: 'workspace', entityId: workspaceId } }),
    false,
  );
});
