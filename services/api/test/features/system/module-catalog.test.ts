import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULE_CATALOG_SCHEMA_VERSION_V1 } from '@databreeze/domain/module-catalog/v1';

import { createApiApplication } from '../../../src/bootstrap.js';
import { ModuleCatalogService } from '../../../src/features/system/application/module-catalog.service.js';

interface ModuleCatalogResponseEntry {
  readonly id: string;
  readonly title: { readonly vi: string; readonly en: string };
}

function isModuleCatalogResponseEntry(value: unknown): value is ModuleCatalogResponseEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Readonly<Record<string, unknown>>;
  const title = entry['title'];
  if (!title || typeof title !== 'object' || Array.isArray(title)) return false;
  const localizedTitle = title as Readonly<Record<string, unknown>>;
  return (
    typeof entry['id'] === 'string' &&
    typeof localizedTitle['vi'] === 'string' &&
    typeof localizedTitle['en'] === 'string'
  );
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isModuleCatalogResponse(value: unknown): value is readonly ModuleCatalogResponseEntry[] {
  return isUnknownArray(value) && value.every(isModuleCatalogResponseEntry);
}

void test('[PLATFORM-004] system module catalog exposes the canonical ten-module read model', () => {
  const result = new ModuleCatalogService().list();

  assert.equal(MODULE_CATALOG_SCHEMA_VERSION_V1, 1);
  assert.equal(result.length, 10);
  assert.equal(result[0]?.id, 'folder-autopilot');
  assert.equal(result.find((entry) => entry.id === 'spreadsheet-auditor')?.lifecycle, 'partial');
  assert.equal(result.find((entry) => entry.id === 'operations-capture')?.lifecycle, 'partial');
  assert.equal(result.find((entry) => entry.id === 'client-report-factory')?.lifecycle, 'planned');
});

void test('[PLATFORM-005] system module catalog is exposed as a public value-free API read', async () => {
  const { app } = await createApiApplication();
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/system/modules' });

    assert.equal(response.statusCode, 200);
    const body: unknown = response.json();
    if (!isModuleCatalogResponse(body)) assert.fail('module catalog response was malformed');
    assert.equal(body.length, 10);
    assert.equal(body[0]?.id, 'folder-autopilot');
    assert.equal(typeof body[0]?.title.vi, 'string');
    assert.equal(typeof body[0]?.title.en, 'string');
  } finally {
    await app.close();
  }
});
