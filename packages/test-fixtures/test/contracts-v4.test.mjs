import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(packageRoot, 'contracts/v4');
const fixtureManifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'));
const schemaManifest = JSON.parse(
  readFileSync(resolve(fixtureRoot, fixtureManifest.schemaManifest), 'utf8'),
);

test('v4 auth fixtures cover every v4 schema with accepted and rejected payloads', () => {
  assert.equal(fixtureManifest.contractVersion, 4);
  assert.equal(fixtureManifest.synthetic, true);
  const schemaIds = new Set(
    schemaManifest.schemas
      .filter((entry) => entry.id.includes('/contracts/v4/'))
      .map((entry) => entry.id),
  );
  const fixtureIds = new Set(fixtureManifest.cases.map((fixtureCase) => fixtureCase.schemaId));
  assert.deepEqual([...fixtureIds].sort(), [...schemaIds].sort());

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const entry of schemaManifest.schemas) {
    ajv.addSchema(
      JSON.parse(readFileSync(resolve(packageRoot, '../contracts', entry.path), 'utf8')),
    );
  }
  for (const schemaId of schemaIds) {
    const cases = fixtureManifest.cases.filter((fixtureCase) => fixtureCase.schemaId === schemaId);
    assert.deepEqual(
      [...new Set(cases.map((fixtureCase) => fixtureCase.expectedAcceptance))].sort(),
      [false, true],
    );
    const validate = ajv.getSchema(schemaId);
    assert.ok(validate);
    for (const fixtureCase of cases) {
      const sourcePath = resolve(fixtureRoot, fixtureCase.source);
      assert.equal(sourcePath.startsWith(`${fixtureRoot}${sep}`), true);
      assert.equal(existsSync(sourcePath), true);
      assert.equal(
        validate(JSON.parse(readFileSync(sourcePath, 'utf8'))),
        fixtureCase.expectedAcceptance,
        `${fixtureCase.id}: ${ajv.errorsText(validate.errors)}`,
      );
    }
  }
});
