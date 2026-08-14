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
const schemaBaseV3 = 'https://schemas.databreeze.dev/contracts/v3';
const schemaBaseV4 = 'https://schemas.databreeze.dev/contracts/v4';

const ids = {
  actorMetadata: `${schemaBase}/actor-metadata`,
  commandEnvelope: `${schemaBase}/command-envelope`,
  correlationMetadata: `${schemaBase}/correlation-metadata`,
  cursorPage: `${schemaBase}/cursor-page`,
  dashboardAuthoringCommandResult: `${schemaBaseV3}/dda-dashboard-authoring-command-result`,
  agentTurnAccepted: `${schemaBaseV4}/dda-agent-turn-accepted`,
  agentTurnCommand: `${schemaBaseV4}/dda-agent-turn-command`,
  conversationListAccepted: `${schemaBaseV4}/dda-conversation-list-accepted`,
  conversationLoadAccepted: `${schemaBaseV4}/dda-conversation-load-accepted`,
  conversationSummary: `${schemaBaseV4}/dda-conversation-summary`,
  iamBootstrapResponse: `${schemaBaseV4}/iam-bootstrap-response`,
  notification: `${schemaBaseV3}/dda-notification`,
  notificationPage: `${schemaBaseV3}/dda-notification-page`,
  notificationStateCommand: `${schemaBaseV3}/dda-notification-state-command`,
  workspaceMemberSettings: `${schemaBaseV3}/dda-workspace-member-settings`,
  eventEnvelope: `${schemaBase}/event-envelope`,
  identifier: `${schemaBase}/identifier`,
  problemDetails: `${schemaBase}/problem-details`,
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

test('publishes the complete deterministic registry and compiles every real schema', () => {
  const { ajv, manifest, schemas } = loadContracts();
  const expectedEntries = [
    ['actor-metadata', `${schemaBase}/actor-metadata`],
    ['command-envelope', `${schemaBase}/command-envelope`],
    ['correlation-metadata', `${schemaBase}/correlation-metadata`],
    ['cursor-page', `${schemaBase}/cursor-page`],
    ['dda-agent-grant', `${schemaBase}/dda-agent-grant`],
    ['dda-analysis-plan', `${schemaBase}/dda-analysis-plan`],
    ['dda-conversation', `${schemaBase}/dda-conversation`],
    ['dda-conversation-context-event', `${schemaBase}/dda-conversation-context-event`],
    ['dda-dashboard-snapshot', `${schemaBase}/dda-dashboard-snapshot`],
    ['dda-dashboard-version', `${schemaBase}/dda-dashboard-version`],
    ['dda-etl-plan', `${schemaBase}/dda-etl-plan`],
    ['dda-folder-manifest', `${schemaBase}/dda-folder-manifest`],
    ['dda-materialization', `${schemaBase}/dda-materialization`],
    ['dda-preparation-summary', `${schemaBase}/dda-preparation-summary`],
    ['dda-receipt-candidate', `${schemaBase}/dda-receipt-candidate`],
    ['dda-receipt-upload', 'https://schemas.databreeze.dev/contracts/v2/dda-receipt-upload'],
    ['dda-dashboard-authoring-command', `${schemaBaseV3}/dda-dashboard-authoring-command`],
    [
      'dda-dashboard-authoring-command-result',
      `${schemaBaseV3}/dda-dashboard-authoring-command-result`,
    ],
    ['dda-dashboard-chart-proposal', `${schemaBaseV3}/dda-dashboard-chart-proposal`],
    ['dda-dashboard-workspace-history', `${schemaBaseV3}/dda-dashboard-workspace-history`],
    ['dda-notification', `${schemaBaseV3}/dda-notification`],
    ['dda-notification-page', `${schemaBaseV3}/dda-notification-page`],
    ['dda-notification-state-command', `${schemaBaseV3}/dda-notification-state-command`],
    ['dda-workspace-member-settings', `${schemaBaseV3}/dda-workspace-member-settings`],
    ['dda-agent-turn-accepted', `${schemaBaseV4}/dda-agent-turn-accepted`],
    ['dda-agent-turn-command', `${schemaBaseV4}/dda-agent-turn-command`],
    ['dda-conversation-list-accepted', `${schemaBaseV4}/dda-conversation-list-accepted`],
    ['dda-conversation-load-accepted', `${schemaBaseV4}/dda-conversation-load-accepted`],
    ['dda-conversation-summary', `${schemaBaseV4}/dda-conversation-summary`],
    ['dda-dashboard-widget-results-accepted', `${schemaBaseV4}/dda-dashboard-widget-results-accepted`],
    ['iam-auth-session', `${schemaBaseV4}/iam-auth-session`],
    ['iam-bootstrap-response', `${schemaBaseV4}/iam-bootstrap-response`],
    ['iam-email-verification-command', `${schemaBaseV4}/iam-email-verification-command`],
    ['iam-password-sign-in-command', `${schemaBaseV4}/iam-password-sign-in-command`],
    ['iam-registration-accepted', `${schemaBaseV4}/iam-registration-accepted`],
    ['iam-registration-command', `${schemaBaseV4}/iam-registration-command`],
    ['jra-worker-dashboard-widget-result-output', `${schemaBaseV4}/jra-worker-dashboard-widget-result-output`],
    ['jra-worker-result-finalize-accepted', `${schemaBaseV4}/jra-worker-result-finalize-accepted`],
    ['jra-worker-result-finalize-command', `${schemaBaseV4}/jra-worker-result-finalize-command`],
    ['jra-worker-result-prepare-accepted', `${schemaBaseV4}/jra-worker-result-prepare-accepted`],
    ['jra-worker-result-prepare-command', `${schemaBaseV4}/jra-worker-result-prepare-command`],
    ['dda-refresh-event', `${schemaBase}/dda-refresh-event`],
    ['dda-source-catalog', `${schemaBase}/dda-source-catalog`],
    ['dda-starter-dashboard-event', `${schemaBase}/dda-starter-dashboard-event`],
    ['dda-table-extraction-candidate', `${schemaBase}/dda-table-extraction-candidate`],
    ['event-envelope', `${schemaBase}/event-envelope`],
    ['identifier', `${schemaBase}/identifier`],
    ['problem-details', `${schemaBase}/problem-details`],
    ['revision', `${schemaBase}/revision`],
    ['tenant-scope', `${schemaBase}/tenant-scope`],
    ['utc-timestamp', `${schemaBase}/utc-timestamp`],
  ];

  assert.equal(manifest.draft, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    manifest.schemas.map((entry) => [entry.name, entry.id]),
    expectedEntries,
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
    './v2',
    './v3',
    './v4',
    './v1/actor-metadata',
    './v1/command-envelope',
    './v1/correlation-metadata',
    './v1/cursor-page',
    './v1/dda-agent-grant',
    './v1/dda-analysis-plan',
    './v1/dda-conversation',
    './v1/dda-conversation-context-event',
    './v1/dda-dashboard-snapshot',
    './v1/dda-dashboard-version',
    './v1/dda-etl-plan',
    './v1/dda-folder-manifest',
    './v1/dda-materialization',
    './v1/dda-preparation-summary',
    './v1/dda-receipt-candidate',
    './v2/dda-receipt-upload',
    './v1/dda-refresh-event',
    './v1/dda-source-catalog',
    './v1/dda-starter-dashboard-event',
    './v1/dda-table-extraction-candidate',
    './v1/event-envelope',
    './v1/identifier',
    './v1/problem-details',
    './v1/revision',
    './v1/tenant-scope',
    './v1/utc-timestamp',
    './v3/dda-dashboard-authoring-command',
    './v3/dda-dashboard-authoring-command-result',
    './v3/dda-dashboard-chart-proposal',
    './v3/dda-dashboard-workspace-history',
    './v3/dda-notification',
    './v3/dda-notification-page',
    './v3/dda-notification-state-command',
    './v3/dda-workspace-member-settings',
    './v4/dda-agent-turn-accepted',
    './v4/dda-agent-turn-command',
    './v4/dda-conversation-list-accepted',
    './v4/dda-conversation-load-accepted',
    './v4/dda-conversation-summary',
    './v4/dda-dashboard-widget-results-accepted',
    './v4/iam-auth-session',
    './v4/iam-bootstrap-response',
    './v4/iam-email-verification-command',
    './v4/iam-password-sign-in-command',
    './v4/iam-registration-accepted',
    './v4/iam-registration-command',
    './v4/jra-worker-dashboard-widget-result-output',
    './v4/jra-worker-result-finalize-accepted',
    './v4/jra-worker-result-finalize-command',
    './v4/jra-worker-result-prepare-accepted',
    './v4/jra-worker-result-prepare-command',
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

test('[Plan 408 / IAM-001 / IAM-009 / WEB-003] Web bootstrap is closed and server scoped', () => {
  const validate = validatorFor(ids.iamBootstrapResponse);
  const response = {
    schemaVersion: 4,
    outcome: 'ACCEPTED',
    value: {
      user: {
        id: actorId,
        displayName: 'Nguyen An',
        locale: 'vi-VN',
        mfaState: 'ENABLED',
      },
      organizations: [{
        id: organizationId,
        name: 'Nguyen An DataBreeze',
        personal: true,
        status: 'ACTIVE',
        workspaces: [{
          id: workspaceId,
          name: 'Personal workspace',
          status: 'ACTIVE',
          projects: [{
            id: projectId,
            name: 'Personal project',
            kind: 'INTERNAL',
            status: 'ACTIVE',
          }],
        }],
      }],
      recentScopes: [{ scopeType: 'project', organizationId, workspaceId, projectId }],
      session: { scopeType: 'project', organizationId, workspaceId, projectId, authorizationEpoch: 1 },
      platform: { apiVersion: 'v1' },
    },
  };

  assert.equal(validate(response), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...response, clientRole: 'owner' }), false);
  assert.equal(validate({ schemaVersion: 4, outcome: 'REJECTED', code: 'UNAVAILABLE' }), true);
});

test('[DDA-055][DDA-056] conversation transports are closed, bounded, and omit client authority', () => {
  const summary = {
    schemaVersion: 4,
    conversationId: organizationId,
    title: 'Phan tich doanh thu',
    datasets: [{ datasetId: workspaceId, datasetVersionId: projectId }],
    dashboardId: actorId,
    filterContext: 'month = 8',
    createdAt: '2026-08-13T01:00:00.000Z',
    updatedAt: '2026-08-13T02:00:00.000Z',
  };
  const list = {
    schemaVersion: 4,
    accepted: true,
    items: [summary],
    nextCursor: 'cursor-v4-conversations-page-2',
  };
  const load = {
    schemaVersion: 4,
    accepted: true,
    conversation: summary,
    messages: [
      {
        messageId: correlationId,
        conversationId: organizationId,
        role: 'USER',
        text: 'So sanh doanh thu.',
        sequence: 1,
        datasetVersionId: projectId,
        createdAt: '2026-08-13T01:30:00.000Z',
      },
    ],
    contextEvents: [
      {
        eventId: workspaceId,
        conversationId: organizationId,
        kind: 'DATASET_VERSION_ADVANCED',
        datasetId: workspaceId,
        beforeVersionId: projectId,
        afterVersionId: actorId,
        sequence: 2,
        occurredAt: '2026-08-13T01:45:00.000Z',
      },
    ],
    nextCursor: 'cursor-v4-messages-page-2',
  };

  assert.equal(validatorFor(ids.conversationSummary)(summary), true);
  assert.equal(validatorFor(ids.conversationListAccepted)(list), true);
  assert.equal(validatorFor(ids.conversationLoadAccepted)(load), true);
  assert.equal(
    validatorFor(ids.conversationSummary)({ ...summary, tenantScope: { scopeType: 'workspace' } }),
    false,
  );
  assert.equal(
    validatorFor(ids.conversationListAccepted)({ ...list, nextCursor: 'not opaque' }),
    false,
  );
  assert.equal(
    validatorFor(ids.conversationLoadAccepted)({
      ...load,
      messages: Array.from({ length: 51 }, () => load.messages[0]),
    }),
    false,
  );
  assert.equal(
    validatorFor(ids.conversationLoadAccepted)({
      ...load,
      contextEvents: [{ ...load.contextEvents[0], authorizationEpoch: 7 }],
    }),
    false,
  );
});

test('[DDA-060] agent turn command and accepted result use exact bounded envelopes', () => {
  const command = {
    schemaVersion: 4,
    conversationId: organizationId,
    messageId: workspaceId,
    text: 'Tinh doanh thu theo khu vuc.',
    idempotencyKey: 'turn-20260813-0001',
    locale: 'vi-VN',
    contextRevision: 2,
    expectedContextRevision: 2,
  };
  const accepted = {
    schemaVersion: 4,
    accepted: true,
    narrative: 'Da tinh bang bo xu ly xac dinh.',
    toolResults: [
      {
        toolCallId: 'call-analysis-1',
        name: 'analysis.execute',
        result: {
          resultId: projectId,
          evidenceRefs: [{ evidenceId: actorId, kind: 'RESULT_CELL' }],
          provenance: {
            planVersionId: correlationId,
            datasetVersionId: workspaceId,
            engineVersion: 'engine-1.0.0',
          },
        },
      },
    ],
  };

  assert.equal(validatorFor(ids.agentTurnCommand)(command), true);
  assert.equal(validatorFor(ids.agentTurnAccepted)(accepted), true);
  assert.equal(validatorFor(ids.agentTurnCommand)({ ...command, agentLevel: 'ANALYZE' }), false);
  assert.equal(validatorFor(ids.agentTurnCommand)({ ...command, schemaVersion: 3 }), false);
  assert.equal(
    validatorFor(ids.agentTurnAccepted)({ ...accepted, idempotencyKey: command.idempotencyKey }),
    false,
  );
  assert.equal(
    validatorFor(ids.agentTurnAccepted)({
      ...accepted,
      toolResults: [{ ...accepted.toolResults[0], result: { value: 42 } }],
    }),
    false,
  );
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

test('keeps notification records closed, content-safe, and revisioned', () => {
  const validateNotification = validatorFor(ids.notification);
  const notification = {
    schemaVersion: 3,
    id: '018f47f2-5ee1-7d8d-a4c2-8f0e19e4cc06',
    workspaceId,
    subjectId: actorId,
    kind: 'SECURITY_NOTICE',
    labelVi: 'Thông báo bảo mật',
    labelEn: 'Security notice',
    action: 'OPEN_SETTINGS',
    createdAt: '2026-08-01T01:30:00.125Z',
    correlationId,
    state: 'UNREAD',
    revision: 1,
  };

  assert.equal(validateNotification(notification), true);
  assert.equal(validateNotification({ ...notification, labelEn: 'Security\u0000notice' }), false);
  assert.equal(validateNotification({ ...notification, action: 'https://example.test' }), false);

  const validatePage = validatorFor(ids.notificationPage);
  assert.equal(validatePage({ schemaVersion: 3, items: [notification], unreadCount: 4 }), true);
  assert.equal(
    validatePage({
      schemaVersion: 3,
      items: [notification],
      unreadCount: 4,
      nextCursor: 'not-opaque',
    }),
    false,
  );

  const validateCommand = validatorFor(ids.notificationStateCommand);
  assert.equal(
    validateCommand({
      schemaVersion: 3,
      state: 'READ',
      expectedRevision: 1,
      idempotencyKey: 'notification-read-018f47f2',
    }),
    true,
  );
  assert.equal(validateCommand({ schemaVersion: 3, state: 'READ', expectedRevision: 1 }), false);
  assert.equal(validateCommand({ schemaVersion: 3, state: 'READ', expectedRevision: 0 }), false);

  const validateResult = validatorFor(ids.dashboardAuthoringCommandResult);
  assert.equal(
    validateResult({
      commandId: actorId,
      dashboardId: workspaceId,
      versionId: projectId,
      revision: 2,
      savedAt: '2026-08-01T01:30:00.125Z',
      publishes: false,
    }),
    true,
  );
  assert.equal(
    validateResult({
      commandId: actorId,
      dashboardId: workspaceId,
      versionId: projectId,
      revision: 2,
      savedAt: '2026-08-01T01:30:00.125Z',
      publishes: true,
    }),
    false,
  );

  const validateSettings = validatorFor(ids.workspaceMemberSettings);
  assert.equal(
    validateSettings({
      schemaVersion: 3,
      workspaceId,
      canManage: true,
      members: [
        {
          memberId: actorId,
          displayName: 'Owner',
          accessPreset: 'OWNER',
          agentGrantLevel: 'APPLY_CONFIRMED_CHANGES',
          agentGrantRevision: 2,
          membershipRevision: 1,
        },
      ],
    }),
    true,
  );
  assert.equal(
    validateSettings({
      schemaVersion: 3,
      workspaceId,
      canManage: true,
      members: [
        {
          memberId: actorId,
          displayName: 'Viewer',
          accessPreset: 'VIEWER',
          agentGrantLevel: 'APPLY_CONFIRMED_CHANGES',
          agentGrantRevision: 2,
          membershipRevision: 1,
        },
      ],
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
