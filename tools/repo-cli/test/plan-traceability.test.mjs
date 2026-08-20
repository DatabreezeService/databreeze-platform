import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));

test('manifest traceability bao phủ đúng chỉ mục yêu cầu và các cổng phát hành', () => {
  const index = readJson('docs/specs/requirement-index.json');
  const manifest = readJson('docs/plans/requirement-traceability.json');
  const expectedPriorityTotals = { P0: 526, P1: 158, P2: 14 };

  assert.equal(index.requirements.length, 698);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(
        index.requirements.reduce((totals, item) => {
          totals[item.priority] = (totals[item.priority] ?? 0) + 1;
          return totals;
        }, {}),
      ).sort(),
    ),
    expectedPriorityTotals,
  );
  assert.deepEqual(manifest.priorityTotals, expectedPriorityTotals);
  assert.equal(manifest.requirements.length, 698);

  const indexById = new Map(index.requirements.map((item) => [item.id, item]));
  const seen = new Set();
  for (const record of manifest.requirements) {
    assert.ok(indexById.has(record.requirementId), `unknown requirement ${record.requirementId}`);
    assert.equal(
      record.priority,
      indexById.get(record.requirementId).priority,
      `${record.requirementId} priority`,
    );
    assert.ok(
      !seen.has(record.requirementId),
      `duplicate primary ownership for ${record.requirementId}`,
    );
    seen.add(record.requirementId);
    assert.ok(Array.isArray(record.supportingTasks));
    assert.ok(Array.isArray(record.codePaths));
    assert.ok(Array.isArray(record.testPaths));
    assert.ok(Array.isArray(record.releaseEvidence));
    assert.ok(['planned', 'partial', 'verified'].includes(record.status));
    assert.match(record.primaryPlan, /^\d{3}-[a-z0-9-]+\.md$/);
    assert.match(record.primaryTask, /^(?:Task )?\d+(?::|\.)/);
    assert.ok(['planned', 'partial', 'verified'].includes(record.coverage));
    assert.ok(
      ['not-verified', 'partial', 'partial-verified', 'verified'].includes(
        record.verificationStatus,
      ),
    );
    if (record.status === 'verified' || record.verificationStatus === 'verified') {
      assert.equal(record.status, 'verified', `${record.requirementId} status transition`);
      assert.equal(record.verificationStatus, 'verified', `${record.requirementId} verification`);
    }
    if (record.verificationStatus === 'partial-verified') {
      assert.equal(record.status, 'partial', `${record.requirementId} partial status`);
    }
    assert.notEqual(
      record.priority === 'P0' || record.priority === 'P1',
      record.releaseStatus === 'post-ga',
      `${record.id} release status`,
    );

    const planPath = path.join(repositoryRoot, 'docs', 'plans', record.primaryPlan);
    assert.ok(existsSync(planPath), `${record.requirementId} plan exists`);
    assert.match(
      readFileSync(planPath, 'utf8'),
      new RegExp(`^### ${record.primaryTask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'),
      `${record.requirementId} task exists`,
    );
    if (
      record.verificationStatus === 'verified' ||
      record.verificationStatus === 'partial-verified'
    ) {
      assert.ok(record.verifiedPaths.length > 0, `${record.requirementId} verified paths`);
    } else if (record.verificationStatus === 'partial') {
      // Partial evidence is allowed to carry zero or more existing paths.
      assert.ok(Array.isArray(record.verifiedPaths), `${record.requirementId} partial paths`);
    } else if (record.verificationStatus === 'not-verified') {
      assert.deepEqual(record.verifiedPaths, [], `${record.requirementId} unverified paths`);
    }
    if (record.verificationStatus !== 'not-verified') {
      for (const verifiedPath of record.verifiedPaths) {
        assert.ok(
          existsSync(path.join(repositoryRoot, verifiedPath)),
          `${record.requirementId} verified path ${verifiedPath}`,
        );
      }
    }
  }
  assert.equal(seen.size, indexById.size);
});

test('device-sync plan retains its implementation body instead of embedded manifest data', () => {
  const plan = readFileSync(
    path.join(repositoryRoot, 'docs', 'plans', '050-devices-sync-offline.md'),
    'utf8',
  );

  assert.match(plan, /^### Task 1: DSO device sync/m);
  assert.match(plan, /^### Task 2: Android and Desktop offline/m);
  assert.match(plan, /^## Release evidence/m);
  assert.doesNotMatch(plan, /"requirements": \[/);
});
