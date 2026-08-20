import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDatasetRecordFromTabular,
  parseCsvContent,
  parseTabularFiles,
  TabularParseError,
  type ParsedTabularData,
  type TabularSourceFileV1,
} from '../src/features/data/csv-parser.ts';
import { parseXlsxContent } from '../src/features/data/xlsx-parser.ts';
import {
  InMemoryDatasetRepository,
  LocalDataStore,
  LocalStoreError,
} from '../src/features/data/local-data-store.ts';
import { ImportSession } from '../src/features/data/import-session.ts';
import { dashboardPinnedStore } from '../src/features/dashboards/dashboard-pinned-store.ts';
import { generateStarterDashboard } from '../src/features/dashboards/starter-dashboard-generator.ts';
import { toDatasetCardV1 } from '../src/features/data/data-model.ts';

function csvFile(fileName: string, text: string): TabularSourceFileV1 {
  return { fileName, bytes: new TextEncoder().encode(text).buffer };
}

function isoNow(): string {
  return new Date().toISOString();
}

describe('[DDA-053] csv parser correctness', () => {
  it('strips a UTF-8 BOM before reading headers', () => {
    const parsed = parseCsvContent('bom.csv', '\uFEFFname,amount\nA,1\n');
    expect(parsed.headers).toEqual(['name', 'amount']);
  });

  it('keeps English-formatted decimals intact instead of mangling them into integers', () => {
    const parsed = parseCsvContent('en.csv', 'item,price\nA,2.55\nB,3.39\nC,2.75\n');
    const price = parsed.columns.find((column) => column.name === 'price');
    expect(price?.type).toBe('DECIMAL');
    expect(parsed.rows[0]?.['price']).toBe(2.55);
    expect(parsed.rows[1]?.['price']).toBe(3.39);
  });

  it('parses Vietnamese-formatted numbers with dot thousands and comma decimals', () => {
    const parsed = parseCsvContent(
      'vi.csv',
      'item,doanh_thu\nA,"1.234,56"\nB,"9.876,50"\nC,"500,25"\n',
    );
    const revenue = parsed.columns.find((column) => column.name === 'doanh_thu');
    expect(revenue?.type).toBe('DECIMAL');
    expect(parsed.rows[0]?.['doanh_thu']).toBe(1234.56);
    expect(parsed.rows[1]?.['doanh_thu']).toBe(9876.5);
  });

  it('flags a column mixing number conventions instead of guessing', () => {
    const parsed = parseCsvContent('mixed.csv', 'item,value\nA,2.55\nB,"2,55"\nC,3.10\n');
    const value = parsed.columns.find((column) => column.name === 'value');
    expect(value?.convention).toBe('MIXED');
    expect(parsed.warnings.join(' ')).toContain('Mixed number formats');
  });

  it('infers DATE for datetime values with a time component', () => {
    const parsed = parseCsvContent('dt.csv', 'ngay,gia_tri\n12/1/2010 8:26,6\n12/2/2010 8:28,3\n');
    const ngay = parsed.columns.find((column) => column.name === 'ngay');
    expect(ngay?.type).toBe('DATE');
  });

  it('counts ragged rows as malformed instead of silently padding', () => {
    const parsed = parseCsvContent('ragged.csv', 'a,b,c\n1,2,3\n4,5\n6,7,8,9\n');
    expect(parsed.totalRows).toBe(3);
    expect(parsed.malformedRowCount).toBe(2);
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('throws typed errors for empty files', () => {
    try {
      parseCsvContent('empty.csv', '');
      expect.unreachable('parseCsvContent should throw');
    } catch (error) {
      expect((error as TabularParseError).code).toBe('EMPTY_FILE');
    }
  });

  it('rejects unsupported file kinds', async () => {
    await expect(parseTabularFiles([csvFile('report.pdf', 'x')])).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });
});

describe('[DDA-053] multi-file parsing', () => {
  it('merges files with identical headers and records per-file sources', async () => {
    const parsed = await parseTabularFiles([
      csvFile('jan.csv', 'region,revenue\nNorth,100\nSouth,200\n'),
      csvFile('feb.csv', 'region,revenue\nNorth,150\n'),
    ]);
    expect(parsed.totalRows).toBe(3);
    expect(parsed.fileSources.map((source) => source.fileName)).toEqual(['jan.csv', 'feb.csv']);
    expect(parsed.fileSources[1]?.rowCount).toBe(1);
  });

  it('throws HEADER_MISMATCH when file columns disagree', async () => {
    await expect(
      parseTabularFiles([
        csvFile('a.csv', 'region,revenue\nNorth,100\n'),
        csvFile('b.csv', 'region,amount\nNorth,100\n'),
      ]),
    ).rejects.toMatchObject({ code: 'HEADER_MISMATCH' });
  });

  it('produces honest quality metadata from the parsed payload', async () => {
    const parsed = await parseTabularFiles([
      csvFile('q.csv', 'region,revenue\nNorth,100\n,200\nSouth,\n'),
    ]);
    const record = buildDatasetRecordFromTabular(parsed, 'vi-VN');
    expect(record.quality?.completeness).toBeLessThan(1);
    expect(record.quality?.completeness).toBeGreaterThan(0);
    expect(record.currentVersion.rowCount).toBe(3);
    expect(record.currentVersion.schema.map((field) => field.nullable)).toEqual([true, true]);
  });
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal stored-entry (method 0) zip writer so tests can build real xlsx bytes. */
function buildZip(files: Record<string, string>): ArrayBuffer {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const count = Object.keys(files).length;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...localChunks, ...centralChunks, eocd];
  const out = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0));
  let position = 0;
  for (const chunk of all) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out.buffer;
}

function buildTestXlsx(): ArrayBuffer {
  return buildZip({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/styles.xml':
      '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c><c r="C1" t="inlineStr"><is><t>When</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>Widget</t></is></c><c r="B2"><v>2.55</v></c><c r="C2" s="1"><v>40544</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>Gadget</t></is></c><c r="B3"><v>3.39</v></c><c r="C3" s="1"><v>40545</v></c></row>' +
      '</sheetData></worksheet>',
  });
}

describe('[DDA-053] native xlsx parser', () => {
  it('reads inline strings, numbers, and styled serial dates', async () => {
    const grid = await parseXlsxContent('catalog.xlsx', buildTestXlsx());
    expect(grid[0]).toEqual(['Name', 'Price', 'When']);
    expect(grid[1]?.[0]).toBe('Widget');
    expect(grid[1]?.[1]).toBe('2.55');
    expect(grid[1]?.[2]).toBe('01/01/2011');
  });

  it('feeds the shared inference pipeline through parseTabularFiles', async () => {
    const parsed = await parseTabularFiles([{ fileName: 'catalog.xlsx', bytes: buildTestXlsx() }]);
    expect(parsed.headers).toEqual(['Name', 'Price', 'When']);
    expect(parsed.columns[1]?.type).toBe('DECIMAL');
    expect(parsed.rows[0]?.['Price']).toBe(2.55);
    expect(parsed.columns[2]?.type).toBe('DATE');
  });

  it('rejects non-zip payloads with NOT_XLSX', async () => {
    await expect(
      parseXlsxContent('fake.xlsx', new TextEncoder().encode('not a zip').buffer),
    ).rejects.toMatchObject({ code: 'NOT_XLSX' });
  });
});

describe('[DDA-052] local dataset store', () => {
  it('projects locale-aware cards from records without recomputing per read', () => {
    const store = new LocalDataStore(new InMemoryDatasetRepository());
    const parsed = parseCsvContent('sales.csv', 'region,revenue\nNorth,100\n');
    const record = buildDatasetRecordFromTabular(parsed, 'vi-VN', { label: 'Doanh số' });
    store.addDataset(record, parsed);

    const cards = store.getDatasets('vi-VN');
    expect(cards[0]?.label).toBe('Doanh số');
    expect(cards[0]?.versionLabel).toContain('1 hàng');
    expect(store.getDatasets('vi-VN')).toBe(cards);
    expect(store.getDataset(record.datasetId, 'en')?.versionLabel).toContain('1 row');
  });

  it('appends a new immutable version with merged rows and additive columns', () => {
    const store = new LocalDataStore(new InMemoryDatasetRepository());
    const first = parseCsvContent('q1.csv', 'region,revenue\nNorth,100\n');
    const record = buildDatasetRecordFromTabular(first, 'vi-VN', { label: 'Doanh số' });
    store.addDataset(record, first);

    const second = parseCsvContent('q2.csv', 'region,revenue,note\nSouth,200,moi\n');
    const updated = store.appendDatasetVersion(record.datasetId, second);
    expect(updated.versions).toHaveLength(2);
    expect(updated.currentVersion.rowCount).toBe(2);
    const tabular = store.getTabularData(record.datasetId);
    expect(tabular?.totalRows).toBe(2);
    expect(tabular?.rows[0]?.['note']).toBeNull();
    expect(tabular?.rows[1]?.['note']).toBe('moi');
  });

  it('refuses appends that drop an existing column', () => {
    const store = new LocalDataStore(new InMemoryDatasetRepository());
    const first = parseCsvContent('a.csv', 'region,revenue\nNorth,100\n');
    const record = buildDatasetRecordFromTabular(first, 'vi-VN');
    store.addDataset(record, first);

    const narrower = parseCsvContent('b.csv', 'region\nSouth\n');
    expect(() => store.appendDatasetVersion(record.datasetId, narrower)).toThrowError(
      LocalStoreError,
    );
  });

  it('surfaces persistence failures through storageStatus', async () => {
    const failing: InMemoryDatasetRepository = new InMemoryDatasetRepository();
    failing.putRecord = async () => {
      throw new Error('quota');
    };
    const store = new LocalDataStore(failing);
    const parsed = parseCsvContent('x.csv', 'a,b\n1,2\n');
    const record = buildDatasetRecordFromTabular(parsed, 'vi-VN');
    store.addDataset(record, parsed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.storageStatus).toBe('PERSIST_FAILED');
  });

  it('migrates legacy localStorage datasets into the repository once', async () => {
    window.localStorage.setItem(
      'databreeze:local_datasets:v1',
      JSON.stringify([
        {
          datasetId: '00000000-0000-4000-8000-0000000000aa',
          label: 'Legacy Sales',
          versionId: 'v1-legacy',
          health: 'READY',
          versionLabel: 'Phiên bản 1',
        },
      ]),
    );
    window.localStorage.setItem(
      'databreeze:local_tabular:v1',
      JSON.stringify({
        '00000000-0000-4000-8000-0000000000aa': parseCsvContent('legacy.csv', 'a\n1\n'),
      }),
    );
    const repository = new InMemoryDatasetRepository();
    const store = new LocalDataStore(repository);
    await store.initialize();

    expect(store.getDatasetRecord('00000000-0000-4000-8000-0000000000aa')?.label).toBe(
      'Legacy Sales',
    );
    expect(window.localStorage.getItem('databreeze:local_datasets:v1')).toBeNull();
    expect(window.localStorage.getItem('databreeze:local_tabular:v1')).toBeNull();
  });
});

describe('[WEB-021][DDA-053] import session dual-track', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the local track only when explicit demo mode is enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const session = new ImportSession({
      destination: { kind: 'NEW_DATASET' },
      datasetName: 'Offline Import',
      files: [csvFile('offline.csv', 'region,revenue\nNorth,100\nSouth,50\n')],
      locale: 'vi-VN',
      demoMode: true,
    });
    await session.start();

    expect(session.getState().track).toBe('LOCAL');
    expect(session.getState().status).toBe('REVIEW');
    expect(session.getState().record?.state).toBe('REVIEW_REQUIRED');
    expect(session.getState().record?.review.counts.input).toBe(2);

    await session.requestRevision('Giữ nguyên đơn vị VND');
    expect(session.getState().record?.revision).toBe(2);
    expect(session.getState().record?.review.corrections).toHaveLength(1);

    const result = await session.approve();
    expect(result?.track).toBe('LOCAL');
    expect(session.getState().record?.state).toBe('READY');
    expect(result?.dataset.label).toBe('Offline Import');

    const singletonModule = await import('../src/features/data/local-data-store.ts');
    const persisted = await singletonModule.localDataStore.getImportRecord(
      session.getState().record!.importId,
    );
    expect(persisted?.state).toBe('READY');
    expect(singletonModule.localDataStore.getDatasetRecord(result!.dataset.datasetId)?.origin).toBe(
      'LOCAL',
    );
  });

  it('keeps server-approved datasets out of the browser-local repository', async () => {
    const importId = '0d1f2e3a-4b5c-4d6e-8f9a-1b2c3d4e5f60';
    const datasetId = '0e2f3e4b-5c6d-4e7f-9a0b-2c3d4e5f6a71';
    const sourceId = '0a1b2c3d-4e5f-4670-8a9b-3d4e5f6a7b81';
    const artifactId = '0b1c2d3e-4f5a-4760-8a9b-4d5e6f7a8b91';
    const fieldId = '0c1d2e3f-4a5b-4860-8a9b-5e6f7a8b9ca1';
    const envelope = (state: 'REVIEW_REQUIRED' | 'READY') => ({
      accepted: true,
      replayed: false,
      value: {
        importId,
        revision: 1,
        state,
        destination: 'NEW_DATASET',
        datasetName: 'Server Import',
        idempotencyKey: 'key-1',
        sources: [
          {
            sessionId: sourceId,
            artifactVersionId: artifactId,
            fileName: 'server.csv',
            mediaType: 'text/csv',
            contentSha256: 'a'.repeat(64),
            byteSize: 30,
            rowCount: 2,
            fields: [
              { fieldId, name: 'region', type: 'TEXT', nullable: false },
              {
                fieldId: '0d1e2f3a-4b5c-4860-8a9b-6f7a8b9cadb2',
                name: 'revenue',
                type: 'INTEGER',
                nullable: false,
              },
            ],
            sampleRows: [],
          },
        ],
        review: {
          reviewRequired: true,
          beforeSample: [],
          afterSample: [],
          counts: { input: 2, output: 2, changed: 0, rejected: 0 },
          quality: { completeness: 1, validity: 1, uniqueness: 1, consistency: 1 },
          warnings: [],
          corrections: [],
        },
        ...(state === 'READY'
          ? {
              accepted: {
                datasetId,
                datasetVersionId: '0f1a2b3c-4d5e-4f60-8a9b-7a8b9c0adbE3'.toLowerCase(),
                definitionVersionId: '00112233-4455-4670-8899-aabbccddeeff',
                dashboardStatus: 'BUILDING',
                approvedAt: isoNow(),
              },
            }
          : {}),
        createdAt: isoNow(),
        updatedAt: isoNow(),
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(
          new Response(JSON.stringify(envelope('REVIEW_REQUIRED')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    const session = new ImportSession({
      destination: { kind: 'NEW_DATASET' },
      datasetName: 'Server Import',
      files: [csvFile('server.csv', 'region,revenue\nNorth,100\nSouth,50\n')],
      locale: 'vi-VN',
    });
    await session.start();
    expect(session.getState().track).toBe('SERVER');
    expect(session.getState().status).toBe('REVIEW');

    // Approve swaps the fetch mock to the READY envelope before resolving.
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(
          new Response(JSON.stringify(envelope('READY')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const result = await session.approve();
    expect(result?.track).toBe('SERVER');
    expect(result?.dataset.datasetId).toBe(datasetId);
    expect(result?.dashboardStatus).toBe('BUILDING');

    const singletonModule = await import('../src/features/data/local-data-store.ts');
    expect(singletonModule.localDataStore.getDatasetRecord(datasetId)).toBeUndefined();
    expect(singletonModule.localDataStore.getTabularData(datasetId)).toBeUndefined();
  });

  it('fails closed on a live network outage instead of creating browser-local data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const session = new ImportSession({
      destination: { kind: 'NEW_DATASET' },
      datasetName: 'Live import',
      files: [csvFile('live.csv', 'region,revenue\nNorth,100\n')],
      locale: 'vi-VN',
    });

    await session.start();

    expect(session.getState().track).toBe('SERVER');
    expect(session.getState().status).toBe('FAILED');
    expect(session.getState().record).toBeUndefined();
  });

  it('fails closed on server rejections instead of silently going local', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(new Response(JSON.stringify({ error: 'hidden' }), { status: 403 })),
      ),
    );
    const session = new ImportSession({
      destination: { kind: 'NEW_DATASET' },
      datasetName: 'Forbidden',
      files: [csvFile('f.csv', 'a\n1\n')],
      locale: 'en',
    });
    await session.start();
    expect(session.getState().status).toBe('FAILED');
    expect(session.getState().track).toBe('SERVER');
  });
});

describe('starter dashboard + pinning integration', () => {
  it('generates starter widgets from a record-projected card', () => {
    const parsed: ParsedTabularData = parseCsvContent(
      'sales.csv',
      'region,revenue\nNorth,100\nSouth,200\nEast,50\n',
    );
    const record = buildDatasetRecordFromTabular(parsed, 'vi-VN');
    const card = toDatasetCardV1(record, 'vi-VN');
    const before = dashboardPinnedStore.getCustomWidgets().length;
    generateStarterDashboard(card, 'vi-VN');
    expect(dashboardPinnedStore.getCustomWidgets().length).toBeGreaterThan(before);
  });
});
