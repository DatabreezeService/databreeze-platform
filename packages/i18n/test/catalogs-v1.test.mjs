import assert from 'node:assert/strict';
import test from 'node:test';

const REQUIRED_KEYS = Object.freeze([
  'product.name',
  'common.yes',
  'common.no',
  'common.notAvailable',
  'common.unknown',
  'action.add',
  'action.approve',
  'action.assign',
  'action.cancel',
  'action.close',
  'action.confirm',
  'action.continue',
  'action.create',
  'action.delete',
  'action.edit',
  'action.open',
  'action.reject',
  'action.retry',
  'action.save',
  'action.search',
  'action.submit',
  'nav.home',
  'nav.inbox',
  'nav.datasets',
  'nav.jobs',
  'nav.reviews',
  'nav.approvals',
  'nav.reports',
  'nav.devices',
  'nav.audit',
  'nav.settings',
  'role.owner',
  'role.admin',
  'role.analyst',
  'role.operator',
  'role.approver',
  'role.viewer',
  'scope.organization',
  'scope.workspace',
  'scope.project',
  'dataMode.local.label',
  'dataMode.local.description',
  'dataMode.hybrid.label',
  'dataMode.hybrid.description',
  'dataMode.cloud.label',
  'dataMode.cloud.description',
  'job.status.created',
  'job.status.queued',
  'job.status.waitingForDevice',
  'job.status.dispatched',
  'job.status.running',
  'job.status.needsReview',
  'job.status.awaitingApproval',
  'job.status.succeeded',
  'job.status.partiallySucceeded',
  'job.status.failed',
  'job.status.cancelRequested',
  'job.status.cancelled',
  'job.status.expired',
  'review.status.open',
  'review.status.acknowledged',
  'review.status.inReview',
  'review.status.resolved',
  'review.status.dismissed',
  'review.status.suppressed',
  'approval.status.pending',
  'approval.status.approved',
  'approval.status.rejected',
  'approval.status.expired',
  'approval.status.invalidated',
  'approval.status.cancelled',
  'offline.available',
  'offline.working',
  'offline.changesQueued',
  'offline.requiresConnection',
  'sync.idle',
  'sync.inProgress',
  'sync.complete',
  'sync.paused',
  'sync.conflict',
  'sync.failed',
  'sync.waitingForNetwork',
  'sync.lastCompletedAt',
  'error.generic',
  'error.genericWithCorrelationId',
  'error.invalidRequest',
  'error.unauthorized',
  'error.forbidden',
  'error.notFound',
  'error.conflict',
  'error.rateLimited',
  'error.serviceUnavailable',
  'error.networkUnavailable',
  'error.sourceOffline',
  'error.sessionExpired',
  'api.error.device_unavailable',
  'api.error.device_not_found',
  'api.error.device_request_rejected',
  'api.error.device_revision_conflict',
  'api.error.device_scope_denied',
  'api.error.invitation_request_rejected',
  'api.error.invitation_scope_denied',
  'api.error.invitation_not_found',
  'api.error.invitation_conflict',
  'api.error.invitation_delivery_unavailable',
  'api.error.invitation_unavailable',
  'retry.now',
  'retry.later',
  'retry.afterSeconds.one',
  'retry.afterSeconds.other',
  'api.error.registration_request_rejected',
  'api.error.registration_unavailable',
  'module.folderAutopilot',
  'module.spreadsheetAuditor',
  'module.quoteIntelligence',
  'module.operationsCapture',
  'module.invoiceLeakDetector',
  'module.clientReportFactory',
  'module.privateDataAnalyst',
  'module.migrationReady',
  'module.dataQualityGuard',
  'module.embeddedImporter',
  'accessibility.mainNavigation',
  'accessibility.loading',
  'accessibility.requiredField',
  'accessibility.progressLabel',
  'status.ready',
  'status.inProgress',
  'status.completed',
]);

function placeholders(message) {
  return [...message.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => match[1]);
}

function assertDeeplyFrozen(value) {
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') {
      assertDeeplyFrozen(child);
    }
  }
}

test('[IAM-016, WEB-013, DSK-021, AND-017, NCO-017] catalogs contain the complete bounded v1 vocabulary without fallback gaps', async () => {
  const { MESSAGE_CATALOGS_V1, MESSAGE_KEYS_V1 } = await import('../src/v1.ts');
  const viKeys = Object.keys(MESSAGE_CATALOGS_V1['vi-VN']);
  const enKeys = Object.keys(MESSAGE_CATALOGS_V1.en);

  assert.deepEqual(MESSAGE_KEYS_V1, REQUIRED_KEYS);
  assert.deepEqual(viKeys, REQUIRED_KEYS);
  assert.deepEqual(enKeys, REQUIRED_KEYS);
});

test('catalog messages and placeholder schemas are equivalent across locales', async () => {
  const { MESSAGE_CATALOGS_V1, MESSAGE_KEYS_V1 } = await import('../src/v1.ts');

  for (const key of MESSAGE_KEYS_V1) {
    const vi = MESSAGE_CATALOGS_V1['vi-VN'][key];
    const en = MESSAGE_CATALOGS_V1.en[key];
    assert.deepEqual(vi.parameters, en.parameters, `${key} must use the same parameter types`);
    assert.deepEqual(
      [...new Set(placeholders(vi.message))].sort(),
      Object.keys(vi.parameters).sort(),
      `${key} Vietnamese placeholders must be declared`,
    );
    assert.deepEqual(
      [...new Set(placeholders(en.message))].sort(),
      Object.keys(en.parameters).sort(),
      `${key} English placeholders must be declared`,
    );
  }
});

test('catalogs are deeply immutable and resist mutation', async () => {
  const { MESSAGE_CATALOGS_V1, MESSAGE_KEYS_V1 } = await import('../src/v1.ts');

  assertDeeplyFrozen(MESSAGE_CATALOGS_V1);
  assertDeeplyFrozen(MESSAGE_KEYS_V1);
  const before = MESSAGE_CATALOGS_V1['vi-VN']['action.save'].message;
  assert.throws(() => {
    MESSAGE_CATALOGS_V1['vi-VN']['action.save'].message = 'Thay đổi';
  }, TypeError);
  assert.equal(MESSAGE_CATALOGS_V1['vi-VN']['action.save'].message, before);
});

test('catalog copy is normalized, non-empty, plain text, and free of placeholders for unfinished work', async () => {
  const { MESSAGE_CATALOGS_V1, MESSAGE_KEYS_V1 } = await import('../src/v1.ts');
  const forbiddenText =
    /(?:<|>|\p{Cc}|[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]|\b(?:TODO|TBD|FIXME|lorem ipsum)\b)/iu;

  for (const locale of ['vi-VN', 'en']) {
    for (const key of MESSAGE_KEYS_V1) {
      const message = MESSAGE_CATALOGS_V1[locale][key].message;
      assert.equal(message, message.normalize('NFC'), `${locale}:${key} must be NFC`);
      assert.equal(message.trim().length > 0, true, `${locale}:${key} must not be empty`);
      assert.doesNotMatch(message, forbiddenText, `${locale}:${key} must remain safe plain text`);
    }
  }
});

test('Vietnamese foundation copy is primary professional copy rather than an English fallback', async () => {
  const { MESSAGE_CATALOGS_V1, MESSAGE_KEYS_V1 } = await import('../src/v1.ts');
  const canonicalNames = new Set([
    'product.name',
    ...MESSAGE_KEYS_V1.filter((key) => key.startsWith('module.')),
  ]);

  for (const key of MESSAGE_KEYS_V1) {
    if (!canonicalNames.has(key)) {
      assert.notEqual(
        MESSAGE_CATALOGS_V1['vi-VN'][key].message,
        MESSAGE_CATALOGS_V1.en[key].message,
        `${key} must not silently fall back to English`,
      );
    }
  }
  assert.equal(MESSAGE_CATALOGS_V1['vi-VN']['role.approver'].message, 'Người phê duyệt');
  assert.match(MESSAGE_CATALOGS_V1['vi-VN']['dataMode.hybrid.description'].message, /dữ liệu/u);
  assert.equal(MESSAGE_CATALOGS_V1['vi-VN']['sync.complete'].message, 'Đồng bộ hoàn tất');
  assert.equal(
    MESSAGE_CATALOGS_V1['vi-VN']['approval.status.cancelled'].message,
    'Yêu cầu đã bị hủy',
  );
  assert.match(
    MESSAGE_CATALOGS_V1['vi-VN']['dataMode.local.description'].message,
    /thiết bị đã được cấp quyền/u,
  );
  assert.match(
    MESSAGE_CATALOGS_V1['vi-VN']['dataMode.cloud.description'].message,
    /Dữ liệu gốc đã được phê duyệt/u,
  );
  assert.equal(
    MESSAGE_CATALOGS_V1['vi-VN']['error.networkUnavailable'].message,
    'Không có kết nối mạng. Các thay đổi được phép sẽ được lưu và đồng bộ sau.',
  );
});
