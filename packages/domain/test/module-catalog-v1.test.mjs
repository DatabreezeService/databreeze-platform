import assert from 'node:assert/strict';
import test from 'node:test';

const catalog = await import('@databreeze/domain/module-catalog/v1');

const expectedIds = [
  'folder-autopilot',
  'spreadsheet-auditor',
  'quote-intelligence',
  'operations-capture',
  'invoice-leak-detector',
  'client-report-factory',
  'private-data-analyst',
  'migration-ready',
  'data-quality-guard',
  'embedded-importer',
];

void test('[PLATFORM-001] catalog exposes all ten modules in stable order', () => {
  assert.equal(catalog.MODULE_CATALOG_SCHEMA_VERSION_V1, 1);
  assert.deepEqual(
    catalog.listProductModulesV1().map((entry) => entry.id),
    expectedIds,
  );
});

void test('[PLATFORM-002] catalog reports honest lifecycle and platform scope', () => {
  const entries = catalog.listProductModulesV1();
  const spreadsheet = entries.find((entry) => entry.id === 'spreadsheet-auditor');
  const report = entries.find((entry) => entry.id === 'client-report-factory');

  assert.equal(spreadsheet?.lifecycle, 'partial');
  assert.equal(entries.find((entry) => entry.id === 'operations-capture')?.lifecycle, 'partial');
  assert.equal(report?.lifecycle, 'planned');
  assert.deepEqual(spreadsheet?.platforms, ['web', 'desktop', 'android']);
  assert.equal(spreadsheet?.title.vi, 'Kiểm toán bảng tính');
  assert.equal(spreadsheet?.title.en, 'Spreadsheet Auditor');
});

void test('[PLATFORM-003] catalog is immutable at runtime', () => {
  const entries = catalog.listProductModulesV1();
  assert.ok(Object.isFrozen(entries));
  assert.ok(Object.isFrozen(entries[0]));
  assert.throws(() => entries.push(entries[0]), TypeError);
});
