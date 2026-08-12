import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPreparationSummary } from '../../../src/features/dda/etl/application/preparation-summary.service.js';

void test('[DDA-053, DSM-016] preparation summary counts every input row exactly once across buckets', () => {
  const summary = buildPreparationSummary({
    summaryId: '00000000-0000-4000-8000-000000000c01',
    datasetVersionId: '00000000-0000-4000-8000-000000000c02',
    automaticPolicy: 'SAFE_NON_LOSSY',
    counts: {
      input: 100,
      output: 97,
      unchanged: 90,
      changed: 7,
      rejected: 2,
      quarantined: 1,
      unsupported: 0,
    },
    transformations: ['TRIM_TEXT', 'CAST_TYPE'],
    warnings: ['HEADER_ALIAS_APPLIED'],
    exclusions: [{ scope: 'row', reasonCode: 'INVALID_NUMBER', count: 2 }],
    healthDimensions: [
      {
        name: 'completeness',
        numerator: 97,
        denominator: 100,
        coverage: 0.97,
        rule: 'non-null required fields',
        sampleStatus: 'PASS',
        limitation: 'Derived from accepted version only',
      },
      {
        name: 'validity',
        numerator: 97,
        denominator: 97,
        coverage: 1,
        rule: 'typed columns',
        sampleStatus: 'PASS',
        limitation: 'Does not imply business correctness',
      },
      {
        name: 'uniqueness',
        numerator: 97,
        denominator: 97,
        coverage: 1,
        rule: 'primary key',
        sampleStatus: 'PASS',
        limitation: 'Key policy version 1',
      },
      {
        name: 'consistency',
        numerator: 97,
        denominator: 97,
        coverage: 1,
        rule: 'cross-field',
        sampleStatus: 'PASS',
        limitation: 'Sampled 200 rows',
      },
      {
        name: 'timeliness',
        numerator: 100,
        denominator: 100,
        coverage: 1,
        rule: 'ingest lag',
        sampleStatus: 'PASS',
        limitation: 'Wall-clock only',
      },
      {
        name: 'accuracy',
        numerator: 0,
        denominator: 0,
        coverage: 0,
        rule: 'no labeled truth set',
        sampleStatus: 'UNKNOWN',
        limitation: 'Never report as percent correct',
      },
    ],
  });
  assert.equal(summary.accepted, true);
  if (!summary.accepted) return;
  const counts = summary.value.counts;
  assert.equal(
    counts.unchanged + counts.changed + counts.rejected + counts.quarantined + counts.unsupported,
    counts.input,
  );
  assert.equal(summary.value.healthDimensions.length, 6);
  assert.equal(summary.value.percentageCorrectLabel, undefined);
  assert.match(JSON.stringify(summary.value), /limitation/i);
});

void test('[DDA-053] incomplete accounting is rejected before summary publication', () => {
  const summary = buildPreparationSummary({
    summaryId: '00000000-0000-4000-8000-000000000c03',
    datasetVersionId: '00000000-0000-4000-8000-000000000c04',
    automaticPolicy: 'NONE',
    counts: {
      input: 10,
      output: 10,
      unchanged: 5,
      changed: 4,
      rejected: 0,
      quarantined: 0,
      unsupported: 0,
    },
    transformations: [],
    warnings: [],
    exclusions: [],
    healthDimensions: [],
  });
  assert.deepEqual(summary, { accepted: false, code: 'INCOMPLETE_ACCOUNTING' });
});
