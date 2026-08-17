import type {
  DatasetCardV1,
  DatasetRecordV1,
  CleaningRevisionV1,
  DatasetCleaningStateV1,
  LocalProjectRecordV1,
} from './data-model.ts';
import { toDatasetCardV1 } from './data-model.ts';
import type { ParsedTabularData } from './csv-parser.ts';
import { computeQuality, MAX_TABULAR_ROWS } from './csv-parser.ts';
import type { DataImportRecordV1 } from './data-import-api.ts';

const LEGACY_STORAGE_KEY = 'databreeze:local_datasets:v1';
const LEGACY_TABULAR_STORAGE_KEY = 'databreeze:local_tabular:v1';
const DB_NAME = 'databreeze-local';
const DB_VERSION = 2;
export const DEMO_DATASET_ID = '00000000-0000-4000-8000-000000000051';

/** Persisted per-dataset agent thread payload; message shapes live in cleaning-agent-store. */
export interface CleaningThreadRecordV1 {
  readonly datasetId: string;
  readonly messages: readonly unknown[];
  readonly autoApplySafe: boolean;
  readonly updatedAt: string;
}

export type LocalStorageStatusV1 = 'PENDING' | 'READY' | 'PERSIST_FAILED';

export class LocalStoreError extends Error {
  public constructor(
    readonly code: 'LIMIT_EXCEEDED' | 'NOT_FOUND' | 'SCHEMA_INCOMPATIBLE',
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'LocalStoreError';
  }
}

export interface LocalDatasetRepository {
  loadAll(): Promise<{
    readonly records: readonly DatasetRecordV1[];
    readonly tabular: ReadonlyMap<string, ParsedTabularData>;
  }>;
  putRecord(record: DatasetRecordV1): Promise<void>;
  deleteRecord(datasetId: string): Promise<void>;
  putTabular(datasetId: string, tabular: ParsedTabularData): Promise<void>;
  deleteTabular(datasetId: string): Promise<void>;
  putImportRecord(record: DataImportRecordV1): Promise<void>;
  getImportRecord(importId: string): Promise<DataImportRecordV1 | undefined>;
  loadProjects(): Promise<LocalProjectRecordV1[]>;
  putProject(project: LocalProjectRecordV1): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  putThread(thread: CleaningThreadRecordV1): Promise<void>;
  getThread(datasetId: string): Promise<CleaningThreadRecordV1 | undefined>;
}

/** Browser adapter backed by IndexedDB so realistic CSV/XLSX payloads survive reloads. */
export class IndexedDbDatasetRepository implements LocalDatasetRepository {
  private database: IDBDatabase | undefined;

  private open(): Promise<IDBDatabase> {
    if (this.database !== undefined) return Promise.resolve(this.database);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('datasets')) db.createObjectStore('datasets', { keyPath: 'datasetId' });
        if (!db.objectStoreNames.contains('tabular')) db.createObjectStore('tabular', { keyPath: 'datasetId' });
        if (!db.objectStoreNames.contains('imports')) db.createObjectStore('imports', { keyPath: 'importId' });
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'projectId' });
        if (!db.objectStoreNames.contains('agent_threads')) db.createObjectStore('agent_threads', { keyPath: 'datasetId' });
      };
      request.onsuccess = () => {
        this.database = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('IDB_OPEN_FAILED'));
    });
  }

  private async request<T>(
    store: string,
    mode: IDBTransactionMode,
    execute: (objectStore: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const request = execute(transaction.objectStore(store));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
    });
  }

  public async loadAll(): Promise<{
    readonly records: readonly DatasetRecordV1[];
    readonly tabular: ReadonlyMap<string, ParsedTabularData>;
  }> {
    const records = await this.request<DatasetRecordV1[]>('datasets', 'readonly', (store) =>
      store.getAll(),
    );
    const tabularRows = await this.request<{ datasetId: string; tabular: ParsedTabularData }[]>(
      'tabular',
      'readonly',
      (store) => store.getAll(),
    );
    const tabular = new Map<string, ParsedTabularData>();
    for (const entry of tabularRows) tabular.set(entry.datasetId, entry.tabular);
    return { records: Object.freeze(records), tabular };
  }

  public putRecord(record: DatasetRecordV1): Promise<void> {
    return this.request<void>('datasets', 'readwrite', (store) => store.put(record));
  }

  public deleteRecord(datasetId: string): Promise<void> {
    return this.request<void>('datasets', 'readwrite', (store) => store.delete(datasetId));
  }

  public putTabular(datasetId: string, tabular: ParsedTabularData): Promise<void> {
    return this.request<void>('tabular', 'readwrite', (store) =>
      store.put({ datasetId, tabular }),
    );
  }

  public deleteTabular(datasetId: string): Promise<void> {
    return this.request<void>('tabular', 'readwrite', (store) => store.delete(datasetId));
  }

  public putImportRecord(record: DataImportRecordV1): Promise<void> {
    return this.request<void>('imports', 'readwrite', (store) => store.put(record));
  }

  public getImportRecord(importId: string): Promise<DataImportRecordV1 | undefined> {
    return this.request<DataImportRecordV1 | undefined>('imports', 'readonly', (store) =>
      store.get(importId),
    );
  }

  public async loadProjects(): Promise<LocalProjectRecordV1[]> {
    return this.request<LocalProjectRecordV1[]>('projects', 'readonly', (store) =>
      store.getAll(),
    );
  }

  public putProject(project: LocalProjectRecordV1): Promise<void> {
    return this.request<void>('projects', 'readwrite', (store) => store.put(project));
  }

  public deleteProject(projectId: string): Promise<void> {
    return this.request<void>('projects', 'readwrite', (store) => store.delete(projectId));
  }

  public putThread(thread: CleaningThreadRecordV1): Promise<void> {
    return this.request<void>('agent_threads', 'readwrite', (store) => store.put(thread));
  }

  public getThread(datasetId: string): Promise<CleaningThreadRecordV1 | undefined> {
    return this.request<CleaningThreadRecordV1 | undefined>('agent_threads', 'readonly', (store) =>
      store.get(datasetId),
    );
  }
}

/** Dependency-free adapter for tests and runtimes without IndexedDB. */
export class InMemoryDatasetRepository implements LocalDatasetRepository {
  private readonly records = new Map<string, DatasetRecordV1>();
  private readonly tabular = new Map<string, ParsedTabularData>();
  private readonly imports = new Map<string, DataImportRecordV1>();
  private readonly projects = new Map<string, LocalProjectRecordV1>();
  private readonly threads = new Map<string, CleaningThreadRecordV1>();

  public loadAll(): Promise<{
    readonly records: readonly DatasetRecordV1[];
    readonly tabular: ReadonlyMap<string, ParsedTabularData>;
  }> {
    return Promise.resolve({
      records: [...this.records.values()],
      tabular: new Map(this.tabular),
    });
  }

  public putRecord(record: DatasetRecordV1): Promise<void> {
    this.records.set(record.datasetId, record);
    return Promise.resolve();
  }

  public deleteRecord(datasetId: string): Promise<void> {
    this.records.delete(datasetId);
    return Promise.resolve();
  }

  public putTabular(datasetId: string, tabular: ParsedTabularData): Promise<void> {
    this.tabular.set(datasetId, tabular);
    return Promise.resolve();
  }

  public deleteTabular(datasetId: string): Promise<void> {
    this.tabular.delete(datasetId);
    return Promise.resolve();
  }

  public putImportRecord(record: DataImportRecordV1): Promise<void> {
    this.imports.set(record.importId, record);
    return Promise.resolve();
  }

  public getImportRecord(importId: string): Promise<DataImportRecordV1 | undefined> {
    return Promise.resolve(this.imports.get(importId));
  }

  public loadProjects(): Promise<LocalProjectRecordV1[]> {
    return Promise.resolve([...this.projects.values()]);
  }

  public putProject(project: LocalProjectRecordV1): Promise<void> {
    this.projects.set(project.projectId, project);
    return Promise.resolve();
  }

  public deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
    return Promise.resolve();
  }

  public putThread(thread: CleaningThreadRecordV1): Promise<void> {
    this.threads.set(thread.datasetId, thread);
    return Promise.resolve();
  }

  public getThread(datasetId: string): Promise<CleaningThreadRecordV1 | undefined> {
    return Promise.resolve(this.threads.get(datasetId));
  }
}

const DEMO_TABULAR_DATA: ParsedTabularData = {
  fileName: 'data.csv',
  headers: [
    'Mã hóa đơn',
    'Mã hàng',
    'Mô tả sản phẩm',
    'Số lượng',
    'Đơn giá ($)',
    'Ngày giao dịch',
    'Mã khách hàng',
    'Quốc gia',
  ],
  columns: [
    { name: 'Mã hóa đơn', type: 'TEXT', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['536365', '536366', '536367'] },
    { name: 'Mã hàng', type: 'TEXT', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['85123A', '71053', '84406B'] },
    { name: 'Mô tả sản phẩm', type: 'TEXT', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['WHITE HANGING HEART T-LIGHT HOLDER', 'WHITE METAL LANTERN', 'CREAM CUPID HEARTS COAT HANGER'] },
    { name: 'Số lượng', type: 'INTEGER', nullCount: 0, invalidCount: 0, convention: 'EN', sampleValues: ['6', '8', '32'] },
    { name: 'Đơn giá ($)', type: 'DECIMAL', nullCount: 0, invalidCount: 0, convention: 'EN', sampleValues: ['2.55', '3.39', '2.75'] },
    { name: 'Ngày giao dịch', type: 'DATE', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['12/1/2010 8:26', '12/2/2010 8:28'] },
    { name: 'Mã khách hàng', type: 'TEXT', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['17850', '13047', '12583'] },
    { name: 'Quốc gia', type: 'TEXT', nullCount: 0, invalidCount: 0, convention: 'NONE', sampleValues: ['United Kingdom', 'France', 'Germany'] },
  ],
  rows: [
    { 'Mã hóa đơn': '536365', 'Mã hàng': '85123A', 'Mô tả sản phẩm': 'WHITE HANGING HEART T-LIGHT HOLDER', 'Số lượng': 6, 'Đơn giá ($)': 2.55, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '71053', 'Mô tả sản phẩm': 'WHITE METAL LANTERN', 'Số lượng': 6, 'Đơn giá ($)': 3.39, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '84406B', 'Mô tả sản phẩm': 'CREAM CUPID HEARTS COAT HANGER', 'Số lượng': 8, 'Đơn giá ($)': 2.75, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '84029G', 'Mô tả sản phẩm': 'KNITTED UNION FLAG HOT WATER BOTTLE', 'Số lượng': 6, 'Đơn giá ($)': 3.39, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '84029E', 'Mô tả sản phẩm': 'RED WOOLLY HOTTIE WHITE HEART.', 'Số lượng': 6, 'Đơn giá ($)': 3.39, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '22752', 'Mô tả sản phẩm': 'SET 7 BABUSHKA NESTING BOXES', 'Số lượng': 2, 'Đơn giá ($)': 7.65, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536365', 'Mã hàng': '21730', 'Mô tả sản phẩm': 'GLASS STAR FROSTED T-LIGHT HOLDER', 'Số lượng': 6, 'Đơn giá ($)': 4.25, 'Ngày giao dịch': '12/1/2010 8:26', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536366', 'Mã hàng': '22633', 'Mô tả sản phẩm': 'HAND WARMER UNION JACK', 'Số lượng': 6, 'Đơn giá ($)': 1.85, 'Ngày giao dịch': '12/1/2010 8:28', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536366', 'Mã hàng': '22632', 'Mô tả sản phẩm': 'HAND WARMER RED POLKA DOT', 'Số lượng': 6, 'Đơn giá ($)': 1.85, 'Ngày giao dịch': '12/1/2010 8:28', 'Mã khách hàng': '17850', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536367', 'Mã hàng': '84879', 'Mô tả sản phẩm': 'ASSORTED COLOUR BIRD ORNAMENT', 'Số lượng': 32, 'Đơn giá ($)': 1.69, 'Ngày giao dịch': '12/1/2010 8:34', 'Mã khách hàng': '13047', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536367', 'Mã hàng': '22745', 'Mô tả sản phẩm': "POPPY'S PLAYHOUSE BEDROOM", 'Số lượng': 6, 'Đơn giá ($)': 2.10, 'Ngày giao dịch': '12/1/2010 8:34', 'Mã khách hàng': '13047', 'Quốc gia': 'United Kingdom' },
    { 'Mã hóa đơn': '536370', 'Mã hàng': '22728', 'Mô tả sản phẩm': 'ALARM CLOCK BAKELIKE PINK', 'Số lượng': 24, 'Đơn giá ($)': 3.75, 'Ngày giao dịch': '12/1/2010 8:45', 'Mã khách hàng': '12583', 'Quốc gia': 'France' },
    { 'Mã hóa đơn': '536370', 'Mã hàng': '22727', 'Mô tả sản phẩm': 'ALARM CLOCK BAKELIKE RED', 'Số lượng': 24, 'Đơn giá ($)': 3.75, 'Ngày giao dịch': '12/1/2010 8:45', 'Mã khách hàng': '12583', 'Quốc gia': 'France' },
    { 'Mã hóa đơn': '536370', 'Mã hàng': '22726', 'Mô tả sản phẩm': 'ALARM CLOCK BAKELIKE GREEN', 'Số lượng': 12, 'Đơn giá ($)': 3.75, 'Ngày giao dịch': '12/1/2010 8:45', 'Mã khách hàng': '12583', 'Quốc gia': 'France' },
    { 'Mã hóa đơn': '536370', 'Mã hàng': '22629', 'Mô tả sản phẩm': 'SPACEBOY LUNCH BOX', 'Số lượng': 24, 'Đơn giá ($)': 1.95, 'Ngày giao dịch': '12/1/2010 8:45', 'Mã khách hàng': '12583', 'Quốc gia': 'France' },
    { 'Mã hóa đơn': '536370', 'Mã hàng': '22659', 'Mô tả sản phẩm': 'LUNCH BOX I LOVE LONDON', 'Số lượng': 24, 'Đơn giá ($)': 1.95, 'Ngày giao dịch': '12/1/2010 8:45', 'Mã khách hàng': '12583', 'Quốc gia': 'France' },
  ],
  totalRows: 16,
  malformedRowCount: 0,
  rawTextSnippet:
    'InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country...',
  warnings: [],
  fileSources: [{ fileName: 'data.csv', byteSize: 2048, rowCount: 16 }],
};

const DEMO_RECORD: DatasetRecordV1 = Object.freeze({
  datasetId: DEMO_DATASET_ID,
  label: 'Bán lẻ Trực tuyến (data.csv)',
  origin: 'LOCAL' as const,
  syncState: 'LOCAL_ONLY' as const,
  createdAt: '2026-08-16T10:00:00.000Z',
  currentVersion: Object.freeze({
    versionId: 'v1-00000000',
    createdAt: '2026-08-16T10:00:00.000Z',
    rowCount: 16,
    schema: Object.freeze(
      DEMO_TABULAR_DATA.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: false,
      })),
    ),
  }),
  versions: Object.freeze([
    Object.freeze({
      versionId: 'v1-00000000',
      createdAt: '2026-08-16T10:00:00.000Z',
      rowCount: 16,
      schema: Object.freeze(
        DEMO_TABULAR_DATA.columns.map((column) => ({
          name: column.name,
          type: column.type,
          nullable: false,
        })),
      ),
    }),
  ]),
  sources: Object.freeze([
    Object.freeze({
      sourceId: '00000000-0000-4000-8000-000000000052',
      label: 'data.csv',
      sourceType: 'CSV' as const,
      versionLabel: 'Bản gốc · 16 hàng',
      statusLabel: 'Đã nhập',
      healthLabel: 'Không có lỗi chặn',
      originalAction: 'VIEW_SAFE' as const,
      evidenceAvailable: true,
    }),
  ]),
  preparation: Object.freeze({
    automaticPolicy: 'SAFE_NON_LOSSY' as const,
    counts: Object.freeze({
      input: 16,
      output: 16,
      unchanged: 16,
      changed: 0,
      rejected: 0,
      quarantined: 0,
      unsupported: 0,
    }),
    transformations: Object.freeze([
      'Chuẩn hóa mã hóa đơn (InvoiceNo)',
      'Chuẩn hóa số lượng & đơn giá',
      'Chuẩn hóa ngày giao dịch (InvoiceDate)',
    ]),
    warnings: Object.freeze([]),
    healthDimensions: Object.freeze([
      Object.freeze({
        dimension: 'Đầy đủ',
        numerator: 128,
        denominator: 128,
        coverage: 1.0,
        rule: 'required-fields',
        expectation: 'Tất cả các bản ghi có đầy đủ thông tin giao dịch',
        sampleState: 'Toàn bộ dữ liệu',
        limitations: Object.freeze([]),
      }),
    ]),
    overallSummary: Object.freeze({
      formula: '100% bản ghi hợp lệ và đã phân tích',
      coverage: 1.0,
      provesFactualCorrectness: false as const,
    }),
    datasetVersionLabel: 'Phiên bản 1',
    engineVersionLabel: 'DataBreeze In-Browser Engine 1.1',
  }),
  quality: Object.freeze({
    completeness: 1,
    validity: 1,
    uniqueness: 1,
    consistency: 1,
  }),
});

export const DEFAULT_DEMO_RECORDS: readonly DatasetRecordV1[] = Object.freeze([DEMO_RECORD]);

/** Adapt a server-provided card into a read-only record so the tree/pipeline can render it. */
export function datasetRecordFromCard(
  card: DatasetCardV1,
  tabular: ParsedTabularData | undefined,
): DatasetRecordV1 {
  const adapted = recordFromLegacyCard(card, tabular);
  return Object.freeze({
    ...adapted,
    origin: 'SERVER',
    syncState: 'SERVER_MIRRORED',
    cleaningState: 'APPROVED',
  });
}

function recordFromLegacyCard(card: DatasetCardV1, tabular: ParsedTabularData | undefined): DatasetRecordV1 {
  const fieldTypes = card.fieldTypes ?? tabular?.columns.map((column) => column.type) ?? [];
  const rowCount = card.rowCount ?? tabular?.totalRows ?? 0;
  const version = {
    versionId: card.versionId ?? 'v1-legacy',
    createdAt: card.publishedAt ?? new Date().toISOString(),
    rowCount,
    schema: fieldTypes.map((type, index) => ({
       name: card.fieldNames?.[index] ?? tabular?.headers[index] ?? `Cột_${index + 1}`,
      type,
      nullable: true,
    })),
  };
  return {
    datasetId: card.datasetId,
    label: card.label,
    origin: 'LOCAL',
    syncState: 'LOCAL_ONLY',
    createdAt: card.publishedAt ?? new Date().toISOString(),
    currentVersion: version,
    versions: [version],
    sources: card.sources ?? [],
    ...(card.quality === undefined ? {} : { quality: card.quality }),
    ...(card.preparation === undefined ? {} : { preparation: card.preparation }),
  };
}

/**
 * Client-side dataset catalog (DDA-052 local track). Keeps a synchronous
 * in-memory snapshot for `useSyncExternalStore` consumers and persists
 * write-through to a repository (IndexedDB in browsers).
 */
export class LocalDataStore {
  private records: DatasetRecordV1[] = [...DEFAULT_DEMO_RECORDS];
  private projects: LocalProjectRecordV1[] = [];
  private tabularData: Map<string, ParsedTabularData> = new Map([[DEMO_DATASET_ID, DEMO_TABULAR_DATA]]);
  private listeners: Set<() => void> = new Set();
  private cardsCache: Map<'en' | 'vi-VN', readonly DatasetCardV1[]> = new Map();
  private repository: LocalDatasetRepository;
  private readyPromise: Promise<void> | undefined;
  private initialized = false;
  private storageStatusValue: LocalStorageStatusV1 = 'PENDING';

  public constructor(repository?: LocalDatasetRepository) {
    this.repository =
      repository ??
      (typeof indexedDB !== 'undefined'
        ? new IndexedDbDatasetRepository()
        : new InMemoryDatasetRepository());
  }

  public get repositoryKind(): 'indexeddb' | 'memory' {
    return this.repository instanceof IndexedDbDatasetRepository ? 'indexeddb' : 'memory';
  }

  public get storageStatus(): LocalStorageStatusV1 {
    return this.storageStatusValue;
  }

  /** Idempotent: loads persisted records (and migrates legacy localStorage once). */
  public initialize(): Promise<void> {
    if (this.readyPromise !== undefined) return this.readyPromise;
    this.readyPromise = this.doInitialize();
    return this.readyPromise;
  }

  private async doInitialize(): Promise<void> {
    const pendingRecords = new Map(this.records.map((record) => [record.datasetId, record]));
    const pendingTabular = new Map(this.tabularData);
    try {
      const { records, tabular } = await this.repository.loadAll();
      const loadedIds = new Set(records.map((record) => record.datasetId));

      if (records.length === 0 && !this.hasLegacyLocalStorage()) {
        if (!this.initialized) this.resetToDefaultsInternal(false);
      } else if (records.length === 0) {
        await this.migrateLegacyLocalStorage();
      } else {
        // Records mutated before load completes win over persisted state; the
        // demo seed only remains when nothing else exists.
        const isDemoOnly = pendingRecords.size === 1 && pendingRecords.has(DEMO_DATASET_ID);
        const merged: DatasetRecordV1[] = [];
        for (const record of records) {
          merged.push(pendingRecords.get(record.datasetId) ?? record);
        }
        if (isDemoOnly) {
          for (const [id, record] of pendingRecords) {
            if (id !== DEMO_DATASET_ID) merged.unshift(record);
          }
        } else {
          for (const [id, record] of pendingRecords) {
            if (!loadedIds.has(id)) merged.unshift(record);
          }
        }
        this.records = merged;
        this.tabularData = new Map([
          ...[...tabular.entries()].filter(([id]) => !pendingTabular.has(id)),
          ...pendingTabular,
        ]);
      }
      this.storageStatusValue = 'READY';
    } catch {
      this.storageStatusValue = 'READY';
    }
    this.projects = await this.repository.loadProjects().catch(() => []);
    this.initialized = true;
    this.invalidateCaches();
    this.notify();

    void this.requestPersistentStorage();
  }

  private hasLegacyLocalStorage(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        (window.localStorage.getItem(LEGACY_STORAGE_KEY) !== null ||
          window.localStorage.getItem(LEGACY_TABULAR_STORAGE_KEY) !== null)
      );
    } catch {
      return false;
    }
  }

  private async migrateLegacyLocalStorage(): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      const storedDatasets = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const storedTabular = window.localStorage.getItem(LEGACY_TABULAR_STORAGE_KEY);
      if (storedDatasets === null && storedTabular === null) return;

      const legacyLabels = new Set(['Bán hàng toàn quốc', 'Tồn kho cửa hàng']);
      const cards: DatasetCardV1[] = storedDatasets
        ? (JSON.parse(storedDatasets) as DatasetCardV1[]).filter(
            (card) => !legacyLabels.has(card.label),
          )
        : [];
      const tabularMap: Record<string, ParsedTabularData> = storedTabular
        ? (JSON.parse(storedTabular) as Record<string, ParsedTabularData>)
        : {};

      const migrated: DatasetRecordV1[] = [];
      for (const card of cards) {
        if (card.datasetId === DEMO_DATASET_ID) continue;
        const record = recordFromLegacyCard(card, tabularMap[card.datasetId]);
        migrated.push(record);
        await this.repository.putRecord(record);
        if (tabularMap[card.datasetId] !== undefined) {
          await this.repository.putTabular(card.datasetId, tabularMap[card.datasetId]!);
        }
      }
      for (const [datasetId, tabular] of Object.entries(tabularMap)) {
        if (datasetId !== DEMO_DATASET_ID && !cards.some((card) => card.datasetId === datasetId)) {
          await this.repository.putTabular(datasetId, tabular);
        }
      }
      this.records = [...migrated, ...DEFAULT_DEMO_RECORDS];
      this.tabularData = new Map([
        ...Object.entries(tabularMap),
        [DEMO_DATASET_ID, DEMO_TABULAR_DATA],
      ]);

      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_TABULAR_STORAGE_KEY);
    } catch {
      // keep demo seed; legacy keys stay untouched for a later retry
    }
  }

  private async requestPersistentStorage(): Promise<void> {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.storage?.persist !== undefined &&
        (await navigator.storage.persisted?.()) === false
      ) {
        await navigator.storage.persist();
      }
    } catch {
      // best effort only
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private invalidateCaches(): void {
    this.cardsCache.clear();
  }

  private persistRecord(record: DatasetRecordV1): void {
    this.repository
      .putRecord(record)
      .then(() => this.setStorageStatus('READY'))
      .catch(() => this.setStorageStatus('PERSIST_FAILED'));
  }

  private setStorageStatus(status: LocalStorageStatusV1): void {
    if (this.storageStatusValue === status) return;
    this.storageStatusValue = status;
    this.notify();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getDatasets(locale: 'en' | 'vi-VN' = 'vi-VN'): readonly DatasetCardV1[] {
    const cached = this.cardsCache.get(locale);
    if (cached !== undefined) return cached;
    const cards = Object.freeze(this.records.map((record) => toDatasetCardV1(record, locale)));
    this.cardsCache.set(locale, cards);
    return cards;
  }

  public getUserUploadedDatasets(locale: 'en' | 'vi-VN' = 'vi-VN'): readonly DatasetCardV1[] {
    return this.getDatasets(locale).filter((card) => card.datasetId !== DEMO_DATASET_ID);
  }

  public getDatasetRecords(): readonly DatasetRecordV1[] {
    return this.records;
  }

  public getDatasetRecord(datasetId: string): DatasetRecordV1 | undefined {
    return this.records.find((record) => record.datasetId === datasetId);
  }

  public getDataset(datasetId: string, locale: 'en' | 'vi-VN' = 'vi-VN'): DatasetCardV1 | undefined {
    const record = this.getDatasetRecord(datasetId);
    return record === undefined ? undefined : toDatasetCardV1(record, locale);
  }

  public getTabularData(datasetId: string): ParsedTabularData | undefined {
    return this.tabularData.get(datasetId);
  }

  // ---- Project grouping (Dự án tree) ----

  public getProjects(): readonly LocalProjectRecordV1[] {
    return this.projects;
  }

  public getProject(projectId: string): LocalProjectRecordV1 | undefined {
    return this.projects.find((project) => project.projectId === projectId);
  }

  public createProject(label: string): LocalProjectRecordV1 {
    const trimmed = label.trim().slice(0, 120);
    const project: LocalProjectRecordV1 = {
      projectId: crypto.randomUUID(),
      label: trimmed.length > 0 ? trimmed : 'Dự án mới',
      createdAt: new Date().toISOString(),
    };
    this.projects = [...this.projects, project];
    this.notify();
    this.repository
      .putProject(project)
      .then(() => this.setStorageStatus('READY'))
      .catch(() => this.setStorageStatus('PERSIST_FAILED'));
    return project;
  }

  public renameProject(projectId: string, label: string): void {
    const trimmed = label.trim().slice(0, 120);
    if (trimmed.length === 0) return;
    this.projects = this.projects.map((project) =>
      project.projectId === projectId ? { ...project, label: trimmed } : project,
    );
    this.notify();
    const updated = this.getProject(projectId);
    if (updated !== undefined) {
      this.repository
        .putProject(updated)
        .then(() => this.setStorageStatus('READY'))
        .catch(() => this.setStorageStatus('PERSIST_FAILED'));
    }
  }

  public deleteProject(projectId: string): void {
    this.projects = this.projects.filter((project) => project.projectId !== projectId);
    // Guard member datasets into the ungrouped bucket.
    this.records = this.records.map((record) => {
      if (record.projectId !== projectId) return record;
      const { projectId: _removed, ...rest } = record;
      void _removed;
      return rest as DatasetRecordV1;
    });
    this.invalidateCaches();
    this.notify();
    for (const record of this.records) this.persistRecord(record);
    this.repository
      .deleteProject(projectId)
      .then(() => this.setStorageStatus('READY'))
      .catch(() => this.setStorageStatus('PERSIST_FAILED'));
  }

  public setDatasetProject(datasetId: string, projectId: string | undefined): void {
    this.records = this.records.map((record) =>
      record.datasetId === datasetId
        ? { ...record, ...(projectId === undefined ? {} : { projectId }) }
        : record,
    );
    this.invalidateCaches();
    this.notify();
    const record = this.getDatasetRecord(datasetId);
    if (record !== undefined) this.persistRecord(record);
  }

  // ---- Cleaning lifecycle (DDA-053 review/approve) ----

  public setCleaningState(datasetId: string, state: DatasetCleaningStateV1): void {
    this.records = this.records.map((record) =>
      record.datasetId === datasetId ? { ...record, cleaningState: state } : record,
    );
    this.invalidateCaches();
    this.notify();
    const record = this.getDatasetRecord(datasetId);
    if (record !== undefined) this.persistRecord(record);
  }

  public approveDataset(datasetId: string): DatasetRecordV1 | undefined {
    const record = this.getDatasetRecord(datasetId);
    if (record === undefined) return undefined;
    const updated: DatasetRecordV1 = { ...record, cleaningState: 'APPROVED' };
    this.records = this.records.map((existing) =>
      existing.datasetId === datasetId ? updated : existing,
    );
    this.invalidateCaches();
    this.notify();
    this.persistRecord(updated);
    return updated;
  }

  /**
   * Record one applied cleaning revision: a new immutable version carrying the
   * post-clean tabular payload. Recomputes quality so cards stay honest.
   */
  public applyCleaning(
    datasetId: string,
    revision: CleaningRevisionV1,
    tabular: ParsedTabularData,
  ): DatasetRecordV1 | undefined {
    const record = this.getDatasetRecord(datasetId);
    if (record === undefined) return undefined;
    if (record.cleaningState === 'APPROVED') {
      throw new LocalStoreError('SCHEMA_INCOMPATIBLE', 'dataset version is approved and locked');
    }
    if (tabular.totalRows > MAX_TABULAR_ROWS) {
      throw new LocalStoreError('LIMIT_EXCEEDED', `dataset exceeds ${MAX_TABULAR_ROWS} rows`);
    }
    const now = new Date().toISOString();
    const version = {
      versionId: `v${record.versions.length + 1}-${datasetId.slice(0, 8)}`,
      createdAt: now,
      rowCount: tabular.totalRows,
      schema: Object.freeze(
        tabular.columns.map((column) => ({
          name: column.name,
          type: column.type,
          nullable: column.nullCount > 0 || column.invalidCount > 0,
        })),
      ),
    };
    const updated: DatasetRecordV1 = {
      ...record,
      currentVersion: version,
      versions: [...record.versions, version],
      appliedRevisions: [...(record.appliedRevisions ?? []), revision],
      quality: computeQuality(tabular),
      cleaningState: 'CLEANING',
    };
    this.records = this.records.map((existing) =>
      existing.datasetId === datasetId ? updated : existing,
    );
    this.tabularData.set(datasetId, tabular);
    this.invalidateCaches();
    this.notify();
    this.persistRecord(updated);
    this.persistTabular(datasetId, tabular);
    return updated;
  }

  // ---- Agent thread persistence ----

  public async saveThread(thread: CleaningThreadRecordV1): Promise<void> {
    await this.repository.putThread(thread);
  }

  public async loadThread(datasetId: string): Promise<CleaningThreadRecordV1 | undefined> {
    return this.repository.getThread(datasetId);
  }

  public addDataset(record: DatasetRecordV1, tabular: ParsedTabularData): DatasetRecordV1 {
    if (tabular.totalRows > MAX_TABULAR_ROWS) {
      throw new LocalStoreError('LIMIT_EXCEEDED', `dataset exceeds ${MAX_TABULAR_ROWS} rows`);
    }
    this.records = [record, ...this.records.filter((existing) => existing.datasetId !== record.datasetId)];
    this.tabularData.set(record.datasetId, tabular);
    this.invalidateCaches();
    this.notify();
    this.persistRecord(record);
    this.persistTabular(record.datasetId, tabular);
    return record;
  }

  /**
   * Append new rows to an existing dataset as a new immutable version.
   * The incoming headers must include every existing column; new columns are
   * additive-compatible and backfilled with null for prior rows.
   */
  public appendDatasetVersion(
    datasetId: string,
    tabular: ParsedTabularData,
  ): DatasetRecordV1 {
    const existing = this.getDatasetRecord(datasetId);
    if (existing === undefined) throw new LocalStoreError('NOT_FOUND', datasetId);
    const existingHeaders = existing.currentVersion.schema.map((field) => field.name);
    const newHeaders = tabular.headers;
    const missing = existingHeaders.filter((header) => !newHeaders.includes(header));
    if (missing.length > 0) {
      throw new LocalStoreError(
        'SCHEMA_INCOMPATIBLE',
        missing.slice(0, 5).join(', '),
      );
    }
    const mergedRowCount = existing.currentVersion.rowCount + tabular.totalRows;
    if (mergedRowCount > MAX_TABULAR_ROWS) {
      throw new LocalStoreError('LIMIT_EXCEEDED', `dataset exceeds ${MAX_TABULAR_ROWS} rows`);
    }

    const existingTabular = this.tabularData.get(datasetId);
    const mergedHeaders = newHeaders;
    const mergedRows: Record<string, string | number | boolean | null>[] = [];
    for (const row of existingTabular?.rows ?? []) {
      const filled: Record<string, string | number | boolean | null> = {};
      for (const header of mergedHeaders) filled[header] = row[header] ?? null;
      mergedRows.push(filled);
    }
    for (const row of tabular.rows) {
      const filled: Record<string, string | number | boolean | null> = {};
      for (const header of mergedHeaders) filled[header] = row[header] ?? null;
      mergedRows.push(filled);
    }

    const now = new Date().toISOString();
    const schema = tabular.columns.map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullCount > 0 || column.invalidCount > 0,
    }));
    const version = {
      versionId: `v${existing.versions.length + 1}-${datasetId.slice(0, 8)}`,
      createdAt: now,
      rowCount: mergedRowCount,
      schema: Object.freeze(schema),
    };
    const mergedTabular: ParsedTabularData = {
      fileName: existingTabular?.fileName ?? tabular.fileName,
      headers: mergedHeaders,
      columns: tabular.columns,
      rows: mergedRows,
      totalRows: mergedRows.length,
      malformedRowCount:
        (existingTabular?.malformedRowCount ?? 0) + tabular.malformedRowCount,
      rawTextSnippet: existingTabular?.rawTextSnippet ?? tabular.rawTextSnippet,
      warnings: [...(existingTabular?.warnings ?? []), ...tabular.warnings],
      fileSources: [...(existingTabular?.fileSources ?? []), ...tabular.fileSources],
    };

    const updated: DatasetRecordV1 = {
      ...existing,
      currentVersion: version,
      versions: [...existing.versions, version],
      sources: [...existing.sources, ...tabular.fileSources.map((file) => ({
        sourceId: crypto.randomUUID(),
        label: file.fileName,
        sourceType: 'CSV' as const,
        versionLabel: `Bản gốc · ${file.rowCount.toLocaleString('vi-VN')} hàng`,
        statusLabel: 'Đã nhập',
        healthLabel: 'Không có lỗi chặn',
        originalAction: 'VIEW_SAFE' as const,
        evidenceAvailable: true,
      }))],
    };
    this.records = this.records.map((record) =>
      record.datasetId === datasetId ? updated : record,
    );
    this.tabularData.set(datasetId, mergedTabular);
    this.invalidateCaches();
    this.notify();
    this.persistRecord(updated);
    this.persistTabular(datasetId, mergedTabular);
    return updated;
  }

  private persistTabular(datasetId: string, tabular: ParsedTabularData): void {
    this.repository
      .putTabular(datasetId, tabular)
      .then(() => this.setStorageStatus('READY'))
      .catch(() => this.setStorageStatus('PERSIST_FAILED'));
  }

  public removeDataset(datasetId: string): void {
    this.records = this.records.filter((record) => record.datasetId !== datasetId);
    this.tabularData.delete(datasetId);
    this.invalidateCaches();
    this.notify();
    this.repository
      .deleteRecord(datasetId)
      .then(() => this.repository.deleteTabular(datasetId))
      .then(() => this.setStorageStatus('READY'))
      .catch(() => this.setStorageStatus('PERSIST_FAILED'));
  }

  private resetToDefaultsInternal(persist: boolean): void {
    this.records = [...DEFAULT_DEMO_RECORDS];
    this.tabularData = new Map([[DEMO_DATASET_ID, DEMO_TABULAR_DATA]]);
    this.invalidateCaches();
    this.notify();
    if (persist) {
      for (const record of this.records) {
        this.persistRecord(record);
        this.persistTabular(record.datasetId, this.tabularData.get(record.datasetId)!);
      }
    }
  }

  public resetToDefaults(): void {
    this.resetToDefaultsInternal(true);
  }

  public async putImportRecord(record: DataImportRecordV1): Promise<void> {
    await this.repository.putImportRecord(record);
  }

  public async getImportRecord(importId: string): Promise<DataImportRecordV1 | undefined> {
    return this.repository.getImportRecord(importId);
  }
}

export const localDataStore = new LocalDataStore();
void localDataStore.initialize();
