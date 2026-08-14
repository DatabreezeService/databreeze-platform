import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(packageRoot, 'contracts/v2/manifest.json');
const schemaPath = resolve(packageRoot, '../contracts/schemas/v2/dda-receipt-upload.schema.json');

test('v2 receipt-upload fixtures cover accept and reject paths', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.contractVersion, 2);
  assert.equal(manifest.synthetic, true);
  const accepted = manifest.cases.filter((item) => item.expectedAcceptance).length;
  const rejected = manifest.cases.length - accepted;
  assert.equal(accepted, 1);
  assert.equal(rejected, 1);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);
  const fixtureRoot = dirname(manifestPath);
  for (const fixtureCase of manifest.cases) {
    const payload = JSON.parse(readFileSync(resolve(fixtureRoot, fixtureCase.source), 'utf8'));
    assert.equal(
      validate(payload),
      fixtureCase.expectedAcceptance,
      `${fixtureCase.id}: ${ajv.errorsText(validate.errors)}`,
    );
  }
});
