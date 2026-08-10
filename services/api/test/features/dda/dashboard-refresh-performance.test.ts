import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

void test('[DDA-035] ON_CHANGE reference profile harness reports p95 within 60 seconds', () => {
  const harness = resolve(process.cwd(), '../../tools/performance/dda-refresh-reference.mjs');
  const result = spawnSync(process.execPath, [harness, '--profile=small-change', '--samples=40'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout) as {
    readonly profile: string;
    readonly p95Ms: number;
    readonly targetMs: number;
    readonly withinTarget: boolean;
    readonly excluded: readonly string[];
  };
  assert.equal(report.profile, 'small-change');
  assert.equal(report.targetMs, 60_000);
  assert.equal(report.withinTarget, true);
  assert.ok(report.p95Ms <= 60_000);
  assert.deepEqual(report.excluded, ['USER_HELD_REVIEW', 'SOURCE_DEVICE_UNAVAILABLE']);
});
