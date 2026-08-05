import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1,
  generateClientReportV1,
  releaseClientReportV1,
} from '@databreeze/domain/client-report-factory/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000201',
  workspaceId: '00000000-0000-4000-8000-000000000202',
};

const request = {
  reportId: '00000000-0000-4000-8000-000000000203',
  reportVersion: 1,
  tenantScope: scope,
  clientId: '00000000-0000-4000-8000-000000000204',
  period: '2026-Q3',
  template: {
    templateId: '00000000-0000-4000-8000-000000000205',
    templateVersion: 1,
    tenantScope: scope,
    supportedFormats: ['WEB', 'PDF'],
    blocks: [
      { blockId: 'intro', type: 'TEXT', text: 'Quarterly report' },
      {
        blockId: 'revenue',
        type: 'METRIC',
        label: 'Revenue',
        field: 'revenue',
        aggregation: 'SUM',
        metricVersionId: '00000000-0000-4000-8000-000000000206',
      },
    ],
  },
  data: {
    datasetId: '00000000-0000-4000-8000-000000000207',
    datasetVersionId: '00000000-0000-4000-8000-000000000208',
    contentSha256: 'a'.repeat(64),
    rows: [
      { rowId: 'r1', revenue: 10 },
      { rowId: 'r2', revenue: 20 },
    ],
    rowEvidence: {
      r1: [{ sourceId: '00000000-0000-4000-8000-000000000208', locator: 'row:r1' }],
      r2: [{ sourceId: '00000000-0000-4000-8000-000000000208', locator: 'row:r2' }],
    },
  },
};

void test('[CRF-004, CRF-007, CRF-008, CRF-020] generates deterministic facts, outputs, and evidence', () => {
  const first = generateClientReportV1(request);
  assert.equal(first.status, 'READY');
  if (first.status !== 'READY') return;
  assert.equal(first.report.schemaVersion, CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1);
  assert.equal(first.report.facts[0]?.value, 30);
  assert.deepEqual(
    first.report.outputs.map((output) => output.format),
    ['WEB', 'PDF'],
  );
  assert.equal(first.report.evidenceManifest[0]?.references.length, 2);
  const second = generateClientReportV1(request);
  assert.equal(second.status, 'READY');
  if (second.status === 'READY') assert.equal(first.report.contentHash, second.report.contentHash);
});

void test('[CRF-015, CRF-016] release requires the exact approved report subject hash', () => {
  const generated = generateClientReportV1(request);
  assert.equal(generated.status, 'READY');
  if (generated.status !== 'READY') return;
  const blocked = releaseClientReportV1(generated.report, {
    approved: true,
    requestedAction: 'RELEASE',
    subjectType: 'CLIENT_REPORT',
    subjectId: request.reportId,
    subjectVersion: String(request.reportVersion),
    subjectHash: 'b'.repeat(64),
    jraApprovalRequestId: '00000000-0000-4000-8000-000000000209',
  });
  assert.deepEqual(blocked, { status: 'BLOCKED', reasons: ['EXACT_SUBJECT_REQUIRED'] });
  const released = releaseClientReportV1(generated.report, {
    approved: true,
    requestedAction: 'RELEASE',
    subjectType: 'CLIENT_REPORT',
    subjectId: request.reportId,
    subjectVersion: String(request.reportVersion),
    subjectHash: generated.report.contentHash,
    jraApprovalRequestId: '00000000-0000-4000-8000-000000000209',
  });
  assert.equal(released.status, 'RELEASED');
});
