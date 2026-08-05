import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_QUALITY_GUARD_SCHEMA_VERSION_V1,
  applyDataQualityRepairV1,
  createDataQualityDatasetV1,
  createDataQualityRepairProposalV1,
  evaluateDataQualityContractV1,
  previewDataQualityRepairV1,
} from '@databreeze/domain/data-quality-guard/v1';

const hash = 'a'.repeat(64);
const datasetId = '00000000-0000-4000-8000-000000000101';
const contractId = '00000000-0000-4000-8000-000000000102';

void test('[DQG-001, DQG-014, DQG-015] evaluates deterministic rules with hashed row evidence', () => {
  const dataset = createDataQualityDatasetV1({
    datasetId,
    datasetVersionId: '00000000-0000-4000-8000-000000000103',
    contentSha256: hash,
    rows: [
      { id: 'a', email: 'a@example.test', age: 20 },
      { id: 'b', email: 'a@example.test', age: 17 },
      { id: 'c', email: '', age: 40 },
    ],
  });
  const result = evaluateDataQualityContractV1(dataset, {
    contractId,
    contractVersion: 1,
    contractSha256: hash,
    rules: [
      {
        ruleId: '00000000-0000-4000-8000-000000000104',
        kind: 'required',
        field: 'email',
        severity: 'ERROR',
      },
      {
        ruleId: '00000000-0000-4000-8000-000000000105',
        kind: 'unique',
        field: 'email',
        severity: 'WARNING',
      },
      {
        ruleId: '00000000-0000-4000-8000-000000000106',
        kind: 'range',
        field: 'age',
        min: 18,
        max: 120,
        severity: 'ERROR',
      },
    ],
  });
  assert.equal(result.schemaVersion, DATA_QUALITY_GUARD_SCHEMA_VERSION_V1);
  assert.equal(result.summary.state, 'FAIL');
  assert.equal(result.summary.failedRules, 3);
  assert.equal(result.findings.length, 3);
  assert.equal(result.findings[0]?.evidence.datasetVersionId, dataset.datasetVersionId);
  assert.equal(typeof result.findings[0]?.valueFingerprint, 'string');
  assert.equal('observedValue' in (result.findings[0] ?? {}), false);
});

void test('[DQG-021, DQG-022] repair previews and derives a new immutable dataset', () => {
  const dataset = createDataQualityDatasetV1({
    datasetId,
    datasetVersionId: '00000000-0000-4000-8000-000000000107',
    contentSha256: hash,
    rows: [{ id: '1', status: ' pending ' }],
  });
  const run = evaluateDataQualityContractV1(dataset, {
    contractId,
    contractVersion: 1,
    contractSha256: hash,
    rules: [
      {
        ruleId: '00000000-0000-4000-8000-000000000108',
        kind: 'allowed-set',
        field: 'status',
        values: ['pending', 'active'],
      },
    ],
  });
  const proposal = createDataQualityRepairProposalV1(dataset, run, [
    { rowNumber: 1, field: 'status', replacement: 'pending', reasonCode: 'TRIMMED_STATUS' },
  ]);
  const preview = previewDataQualityRepairV1(dataset, proposal);
  assert.equal(preview.affectedRows, 1);
  const repaired = applyDataQualityRepairV1(dataset, proposal);
  assert.equal(dataset.rows[0].status, ' pending ');
  assert.equal(repaired.rows[0].status, 'pending');
  assert.equal(repaired.sourceDatasetVersionId, dataset.datasetVersionId);
  assert.notEqual(repaired.datasetVersionId, dataset.datasetVersionId);
});

void test('[DQG-006] rejects duplicate rule identities before evaluating source rows', () => {
  const dataset = createDataQualityDatasetV1({
    datasetId,
    datasetVersionId: '00000000-0000-4000-8000-000000000109',
    contentSha256: hash,
    rows: [],
  });
  assert.throws(
    () =>
      evaluateDataQualityContractV1(dataset, {
        contractId,
        contractVersion: 1,
        contractSha256: hash,
        rules: [
          { ruleId: '00000000-0000-4000-8000-000000000110', kind: 'required', field: 'x' },
          { ruleId: '00000000-0000-4000-8000-000000000110', kind: 'required', field: 'y' },
        ],
      }),
    /DUPLICATE_RULE_ID/,
  );
});
