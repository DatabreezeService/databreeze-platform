import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(packageRoot, 'contracts/v1');
const fixtureManifestPath = resolve(fixtureRoot, 'manifest.json');
const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8'));
const schemaManifestPath = resolve(fixtureRoot, fixtureManifest.schemaManifest);
const schemaManifest = JSON.parse(readFileSync(schemaManifestPath, 'utf8'));

test('publishes a deterministic synthetic v1 contract fixture registry', () => {
  assert.equal(fixtureManifest.package, '@databreeze/test-fixtures');
  assert.equal(fixtureManifest.fixtureVersion, 1);
  assert.equal(fixtureManifest.contractVersion, 1);
  assert.equal(fixtureManifest.synthetic, true);
  assert.equal(fixtureManifest.cases.length, 28);

  const caseIds = fixtureManifest.cases.map((fixtureCase) => fixtureCase.id);
  assert.equal(new Set(caseIds).size, caseIds.length, 'fixture case IDs must be unique');
  for (const caseId of caseIds) {
    assert.match(caseId, /^v1\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
  }
});

test('covers every canonical schema with accepted and rejected payloads', () => {
  const canonicalIds = schemaManifest.schemas.map((schema) => schema.id);
  const fixtureIds = new Set(fixtureManifest.cases.map((fixtureCase) => fixtureCase.schemaId));
  assert.deepEqual([...fixtureIds].sort(), [...canonicalIds].sort());

  for (const schemaId of canonicalIds) {
    const expectations = new Set(
      fixtureManifest.cases
        .filter((fixtureCase) => fixtureCase.schemaId === schemaId)
        .map((fixtureCase) => fixtureCase.expectedAcceptance),
    );
    assert.deepEqual(
      [...expectations].sort(),
      [false, true],
      `${schemaId} must have accepted and rejected fixtures`,
    );
  }
});

test('loads every source as a hand-authored JSON payload inside the versioned package', () => {
  const sources = new Set();
  for (const fixtureCase of fixtureManifest.cases) {
    assert.equal(typeof fixtureCase.expectedAcceptance, 'boolean');
    assert.equal(sources.has(fixtureCase.source), false, `duplicate source: ${fixtureCase.source}`);
    sources.add(fixtureCase.source);

    const sourcePath = resolve(fixtureRoot, fixtureCase.source);
    assert.equal(
      sourcePath.startsWith(`${fixtureRoot}${sep}`),
      true,
      `fixture source escapes v1 root: ${fixtureCase.source}`,
    );
    assert.equal(existsSync(sourcePath), true, `fixture source is missing: ${fixtureCase.source}`);
    assert.doesNotThrow(() => JSON.parse(readFileSync(sourcePath, 'utf8')));
  }
});

test('includes the required composition coverage', () => {
  const coverage = new Set(fixtureManifest.cases.flatMap((fixtureCase) => fixtureCase.covers));
  assert.deepEqual(
    [
      'command.idempotency',
      'cursor.continuing',
      'cursor.terminal',
      'event.identity',
      'event.revision',
      'problem.message-localization',
      'problem.rate-limit',
      'problem.title-localization',
      'tenant.organization',
      'tenant.project',
      'tenant.workspace',
    ].filter((requirement) => !coverage.has(requirement)),
    [],
  );
});
