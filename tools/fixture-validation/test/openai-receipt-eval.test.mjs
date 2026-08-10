import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runOpenAiReceiptEval } from '../src/run-openai-receipt-eval.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/dda/receipt-expense/openai-eval');

void test('[DDA-041, DDA-042] offline receipt eval scores synthetic corpus without network', async () => {
  const report = await runOpenAiReceiptEval(['--offline']);
  assert.equal(report.mode, 'offline');
  assert.equal(report.offlineVerified, true);
  assert.equal(report.liveEvaluation, 'blocked-owner-run');
  assert.equal(report.productionReady, false);
  assert.equal(report.aggregate.percentageCorrect, 'not-evaluated');
  assert.equal(report.aggregate.caseCount, 3);
  assert.ok(report.aggregate.refusalCount >= 1);
  assert.ok(report.aggregate.schemaFailureCount >= 1);

  const vi = report.caseScores.find((row) => row.caseId === 'synthetic-vi');
  assert.ok(vi);
  assert.equal(vi.arithmeticReconciliation, 'pass');
  assert.equal(vi.coordinateValidity, 'pass');
  assert.equal(vi.perField.merchant.normalizedMatch, true);
  assert.equal(vi.percentageCorrect, 'not-evaluated');
});

void test('[DDA-041] offline eval fails when fixture hash changes', async () => {
  const manifestPath = join(FIXTURE_DIR, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const mutated = JSON.parse(original);
  mutated.cases[0].contentSha256 = '0'.repeat(64);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(manifestPath, `${JSON.stringify(mutated, null, 2)}\n`);
  try {
    await assert.rejects(() => runOpenAiReceiptEval(['--offline']), /hash mismatch/u);
  } finally {
    writeFileSync(manifestPath, original);
  }
});

void test('[DDA-044] live mode fails closed before network when gates are missing', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      () =>
        runOpenAiReceiptEval([
          '--live',
          '--acknowledge-external-egress',
          '--corpus',
          'synthetic',
          '--max-requests',
          '1',
          '--max-input-bytes',
          '3000000',
        ]),
      /OPENAI_API_KEY/u,
    );
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

void test('[DDA-043] recorded responses and expected fixtures contain no secret-shaped literals', () => {
  const recorded = readFileSync(join(FIXTURE_DIR, 'recorded-provider-responses.json'), 'utf8');
  const manifest = readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8');
  assert.doesNotMatch(recorded, /sk-[a-zA-Z0-9]{20,}/u);
  assert.doesNotMatch(manifest, /sk-[a-zA-Z0-9]{20,}/u);
  assert.match(manifest, /noCustomerData/u);
});
