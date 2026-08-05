import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmbeddedImportSchemaV1,
  validateEmbeddedImportV1,
} from '@databreeze/domain/embedded-importer/v1';

const id = (suffix) => `00000000-0000-4000-8000-0000000006${suffix}`;

void test('[EI-001, EI-004, EI-012] validates a governed embedded import origin and payload', () => {
  const schema = createEmbeddedImportSchemaV1({
    schemaId: id('01'),
    version: 1,
    name: 'Contacts',
    allowedOrigins: ['https://app.example.test'],
    fields: [
      { key: 'email', type: 'TEXT', required: true },
      { key: 'name', type: 'TEXT', required: false },
    ],
  });
  assert.equal(schema.accepted, true);
  if (!schema.accepted) return;
  const result = validateEmbeddedImportV1(schema.value, {
    importId: id('02'),
    origin: 'https://app.example.test',
    records: [{ email: 'a@example.test', name: 'A' }],
  });
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.value.status, 'ACCEPTED');
});

void test('[EI-006, EI-009] rejects untrusted origins and missing required fields', () => {
  const schema = createEmbeddedImportSchemaV1({
    schemaId: id('03'),
    version: 1,
    name: 'Contacts',
    allowedOrigins: ['https://app.example.test'],
    fields: [{ key: 'email', type: 'TEXT', required: true }],
  });
  assert.equal(schema.accepted, true);
  if (!schema.accepted) return;
  const result = validateEmbeddedImportV1(schema.value, {
    importId: id('04'),
    origin: 'https://evil.example.test',
    records: [{}],
  });
  assert.equal(result.accepted, false);
});
