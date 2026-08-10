import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IntakeIaeFinalizationPortV1 } from '../../../src/features/dda/intake/application/intake-profile.port.js';
import { WebIntakeServiceV1 } from '../../../src/features/dda/intake/application/web-intake.service.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const goldenPath = resolve(
  process.cwd(),
  '../../packages/contracts/test/fixtures/dda/v1/golden-valid.json',
);
const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as {
  readonly 'dda-etl-plan': { readonly inputArtifactVersionId: string };
};
const inputArtifactVersionId = golden['dda-etl-plan'].inputArtifactVersionId;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, content: Uint8Array): Uint8Array {
  const nameBytes = Buffer.from(name, 'utf8');
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc32(content), 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  nameBytes.copy(local, 30);
  compressed.copy(local, 30 + nameBytes.length);

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc32(content), 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  nameBytes.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([local, central, end]);
}

function minimalXlsx(options?: {
  readonly macro?: boolean;
  readonly sheets?: number;
  readonly columns?: number;
  readonly rows?: number;
}): Uint8Array {
  const sheetCount = options?.sheets ?? 1;
  const columns = options?.columns ?? 2;
  const rows = options?.rows ?? 2;
  const entries: Array<{ name: string; content: Uint8Array }> = [];
  const sheetRefs = Array.from({ length: sheetCount }, (_, index) => {
    const sheetId = index + 1;
    const cells: string[] = [];
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const colName = String.fromCharCode(65 + (col % 26));
        cells.push(`<c r="${colName}${row}"><v>${row}</v></c>`);
      }
    }
    entries.push({
      name: `xl/worksheets/sheet${sheetId}.xml`,
      content: Buffer.from(
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells.join('')}</row></sheetData></worksheet>`,
        'utf8',
      ),
    });
    return `<sheet name="S${sheetId}" sheetId="${sheetId}" r:id="rId${sheetId}"/>`;
  }).join('');
  const relationships = Array.from(
    { length: sheetCount },
    (_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  entries.unshift(
    {
      name: 'xl/workbook.xml',
      content: Buffer.from(
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetRefs}</sheets></workbook>`,
        'utf8',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: Buffer.from(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
        'utf8',
      ),
    },
  );
  if (options?.macro) {
    entries.push({ name: 'xl/vbaProject.bin', content: Buffer.from('macro') });
  }
  // Single-entry helper reused for multi by concatenating via zipEntry of first only for small cases.
  // Build a real multi-entry ZIP.
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.content);
    const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(entry.content), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    compressed.copy(local, 30 + nameBytes.length);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc32(entry.content), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    parts.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralDir, end]);
}

function createService(iae?: IntakeIaeFinalizationPortV1) {
  const finals: string[] = [];
  const port: IntakeIaeFinalizationPortV1 = iae ?? {
    finalizeSession(input) {
      if (finals.includes(input.sessionId)) {
        return Promise.resolve({
          accepted: false as const,
          code: 'DDA_INTAKE_DUPLICATE_FINALIZATION' as const,
        });
      }
      finals.push(input.sessionId);
      return Promise.resolve({
        accepted: true,
        value: {
          sessionId: input.sessionId,
          artifactVersionId: inputArtifactVersionId,
          status: 'FINALIZED',
        },
      });
    },
  };
  return { service: new WebIntakeServiceV1(port), finals };
}

void test('[DDA-002] rejects renamed executable disguised as CSV', async () => {
  const { service } = createService();
  const bytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, ...Buffer.from('not a csv')]);
  const result = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000101',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(bytes),
    bytes,
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_INTAKE_RENAMED_EXECUTABLE');
});

void test('[DDA-002] rejects malformed CSV encoding', async () => {
  const { service } = createService();
  const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x41, 0x00]);
  const result = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000102',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(bytes),
    bytes,
    declaredEncoding: 'utf-8',
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_INTAKE_MALFORMED_ENCODING');
});

void test('[DDA-002] rejects zip bomb archives', async () => {
  const { service } = createService();
  const huge = Buffer.alloc(2_000_000, 0x41);
  const bytes = zipEntry('xl/worksheets/sheet1.xml', huge);
  const result = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000103',
    fileName: 'bomb.xlsx',
    claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSha256: sha256(bytes),
    bytes,
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_INTAKE_ZIP_BOMB');
});

void test('[DDA-002] rejects macro-enabled workbooks', async () => {
  const { service } = createService();
  const bytes = minimalXlsx({ macro: true });
  const result = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000104',
    fileName: 'macro.xlsx',
    claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSha256: sha256(bytes),
    bytes,
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_INTAKE_MACRO_ENABLED');
});

void test('[DDA-002] rejects excessive rows columns sheets and size', async () => {
  const { service } = createService();
  const oversized = Buffer.alloc(600_000, 0x61);
  const sizeResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000105',
    fileName: 'big.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(oversized),
    bytes: oversized,
  });
  assert.equal(sizeResult.accepted, false);
  if (!sizeResult.accepted) assert.equal(sizeResult.code, 'DDA_INTAKE_LIMIT_SIZE');

  const manyRows = Buffer.from(`a,b\n${'1,2\n'.repeat(20_001)}`, 'utf8');
  const rowResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000106',
    fileName: 'rows.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(manyRows),
    bytes: manyRows,
  });
  assert.equal(rowResult.accepted, false);
  if (!rowResult.accepted) assert.equal(rowResult.code, 'DDA_INTAKE_LIMIT_ROWS');

  const manyCols = Buffer.from(
    `${Array.from({ length: 257 }, (_, i) => `c${i}`).join(',')}\n1\n`,
    'utf8',
  );
  const colResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000107',
    fileName: 'cols.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(manyCols),
    bytes: manyCols,
  });
  assert.equal(colResult.accepted, false);
  if (!colResult.accepted) assert.equal(colResult.code, 'DDA_INTAKE_LIMIT_COLUMNS');

  const manySheets = minimalXlsx({ sheets: 9 });
  const sheetResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000108',
    fileName: 'sheets.xlsx',
    claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSha256: sha256(manySheets),
    bytes: manySheets,
  });
  assert.equal(sheetResult.accepted, false);
  if (!sheetResult.accepted) assert.equal(sheetResult.code, 'DDA_INTAKE_LIMIT_SHEETS');
});

void test('[DDA-002] rejects formula limit overflow', async () => {
  const { service } = createService();
  const formulas = Array.from(
    { length: 501 },
    (_, i) => `<c r="A${i + 1}"><f>SUM(1)</f><v>1</v></c>`,
  ).join('');
  const sheet = Buffer.from(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${formulas}</row></sheetData></worksheet>`,
    'utf8',
  );
  const bytes = zipEntry('xl/worksheets/sheet1.xml', sheet);
  // prepend workbook structure via multi builder with custom sheet content
  const workbook = minimalXlsx();
  // Replace approach: inspect formula count in a workbook that embeds formulas in sheet xml
  const formulaBook = (() => {
    const entries = [
      {
        name: 'xl/workbook.xml',
        content: Buffer.from(
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
          'utf8',
        ),
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        content: Buffer.from(
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
          'utf8',
        ),
      },
      { name: 'xl/worksheets/sheet1.xml', content: sheet },
    ];
    const parts: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, 'utf8');
      const compressed = deflateRawSync(entry.content);
      const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(8, 8);
      local.writeUInt32LE(crc32(entry.content), 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(entry.content.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      nameBytes.copy(local, 30);
      compressed.copy(local, 30 + nameBytes.length);
      const central = Buffer.alloc(46 + nameBytes.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(8, 10);
      central.writeUInt32LE(crc32(entry.content), 16);
      central.writeUInt32LE(compressed.length, 20);
      central.writeUInt32LE(entry.content.length, 24);
      central.writeUInt16LE(nameBytes.length, 28);
      central.writeUInt32LE(offset, 42);
      nameBytes.copy(central, 46);
      parts.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, centralDir, end]);
  })();
  void workbook;
  void bytes;
  const result = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000109',
    fileName: 'formulas.xlsx',
    claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSha256: sha256(formulaBook),
    bytes: formulaBook,
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'DDA_INTAKE_FORMULA_LIMIT');
});

void test('[DDA-002] rejects checksum mismatch and duplicate finalization', async () => {
  const { service } = createService();
  const bytes = Buffer.from('name,amount\nA,1\n', 'utf8');
  const mismatch = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000110',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: 'b'.repeat(64),
    bytes,
  });
  assert.equal(mismatch.accepted, false);
  if (!mismatch.accepted) assert.equal(mismatch.code, 'DDA_INTAKE_CHECKSUM_MISMATCH');

  const first = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000111',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(bytes),
    bytes,
  });
  assert.equal(first.accepted, true);
  const second = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000111',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(bytes),
    bytes,
  });
  assert.equal(second.accepted, false);
  if (!second.accepted) assert.equal(second.code, 'DDA_INTAKE_DUPLICATE_FINALIZATION');
});

void test('[DDA-002] accepts valid small CSV and XLSX and returns IDs only', async () => {
  const { service } = createService();
  const csv = Buffer.from('name,amount\nCafe,120000\n', 'utf8');
  const csvResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000112',
    fileName: 'sales.csv',
    claimedMediaType: 'text/csv',
    expectedSha256: sha256(csv),
    bytes: csv,
  });
  assert.equal(csvResult.accepted, true);
  if (csvResult.accepted) {
    assert.equal(csvResult.value.artifactVersionId, inputArtifactVersionId);
    assert.equal(csvResult.value.status, 'FINALIZED');
    assert.equal(csvResult.value.profileId, 'dda.web.tabular.v1');
    assert.equal('bytes' in csvResult.value, false);
    assert.doesNotMatch(JSON.stringify(csvResult.value), /Cafe|120000/u);
  }

  const xlsx = minimalXlsx();
  const xlsxResult = await service.finalizeUpload({
    tenantScope,
    sessionId: '00000000-0000-4000-8000-000000000113',
    fileName: 'sales.xlsx',
    claimedMediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expectedSha256: sha256(xlsx),
    bytes: xlsx,
  });
  assert.equal(xlsxResult.accepted, true);
});

void test('[DDA-002] publishes explicit V1 intake profile limits', () => {
  const { service } = createService();
  const profile = service.publishedProfile();
  assert.equal(profile.profileId, 'dda.web.tabular.v1');
  assert.deepEqual(profile.csv.encodings, ['utf-8', 'utf-8-sig', 'windows-1258']);
  assert.equal(profile.limits.maxBytes, 512_000);
  assert.equal(profile.limits.maxRows, 20_000);
  assert.equal(profile.limits.maxColumns, 256);
  assert.equal(profile.limits.maxSheets, 8);
  assert.equal(profile.limits.maxFormulas, 500);
  assert.equal(profile.xlsx.macrosAllowed, false);
  assert.equal(profile.xlsx.externalLinksAllowed, false);
});
