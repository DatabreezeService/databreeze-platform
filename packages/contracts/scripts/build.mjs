import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'manifest.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const entry of manifest.schemas) {
  const schema = JSON.parse(readFileSync(resolve(packageRoot, entry.path), 'utf8'));
  if (schema.$id !== entry.id) {
    throw new Error(`Manifest ID does not match ${entry.path}`);
  }
  ajv.addSchema(schema);
}

for (const entry of manifest.schemas) {
  if (!ajv.getSchema(entry.id)) {
    throw new Error(`Schema did not compile: ${entry.id}`);
  }
}

console.log(`Compiled ${manifest.schemas.length} canonical JSON Schemas.`);
