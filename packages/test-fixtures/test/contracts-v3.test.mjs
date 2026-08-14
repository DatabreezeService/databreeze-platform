import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(packageRoot, 'contracts/v3');
const fixtureManifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'));
const schemaManifest = JSON.parse(
  readFileSync(resolve(fixtureRoot, fixtureManifest.schemaManifest), 'utf8'),
);

test('v3 fixtures cover every migrated schema with accepted and rejected payloads', () => {
  assert.equal(fixtureManifest.package, '@databreeze/test-fixtures');
  assert.equal(fixtureManifest.fixtureVersion, 1);
  assert.equal(fixtureManifest.contractVersion, 3);
  assert.equal(fixtureManifest.synthetic, true);

  const v3Schemas = schemaManifest.schemas.filter((entry) => entry.id.includes('/contracts/v3/'));
  const v3Ids = new Set(v3Schemas.map((entry) => entry.id));
  const fixtureIds = new Set(fixtureManifest.cases.map((fixtureCase) => fixtureCase.schemaId));
  assert.deepEqual([...fixtureIds].sort(), [...v3Ids].sort());

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const entry of schemaManifest.schemas) {
    ajv.addSchema(
      JSON.parse(readFileSync(resolve(packageRoot, '../contracts', entry.path), 'utf8')),
    );
  }

  const sources = new Set();
  for (const schemaId of v3Ids) {
    const cases = fixtureManifest.cases.filter((fixtureCase) => fixtureCase.schemaId === schemaId);
    assert.deepEqual(
      [...new Set(cases.map((fixtureCase) => fixtureCase.expectedAcceptance))].sort(),
      [false, true],
      `${schemaId} must have accepted and rejected fixtures`,
    );
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate, `v3 schema must compile: ${schemaId}`);
    for (const fixtureCase of cases) {
      assert.equal(/^v3\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(fixtureCase.id), true);
      assert.equal(
        sources.has(fixtureCase.source),
        false,
        `duplicate source: ${fixtureCase.source}`,
      );
      sources.add(fixtureCase.source);
      const sourcePath = resolve(fixtureRoot, fixtureCase.source);
      assert.equal(sourcePath.startsWith(`${fixtureRoot}${sep}`), true);
      assert.equal(
        existsSync(sourcePath),
        true,
        `fixture source is missing: ${fixtureCase.source}`,
      );
      const payload = JSON.parse(readFileSync(sourcePath, 'utf8'));
      assert.equal(
        validate(payload),
        fixtureCase.expectedAcceptance,
        `${fixtureCase.id}: ${ajv.errorsText(validate.errors)}`,
      );
    }
  }
});
