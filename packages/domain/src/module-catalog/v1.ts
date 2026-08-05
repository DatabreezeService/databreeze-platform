export const MODULE_CATALOG_SCHEMA_VERSION_V1 = 1 as const;

export type ModuleIdV1 =
  | 'folder-autopilot'
  | 'spreadsheet-auditor'
  | 'quote-intelligence'
  | 'operations-capture'
  | 'invoice-leak-detector'
  | 'client-report-factory'
  | 'private-data-analyst'
  | 'migration-ready'
  | 'data-quality-guard'
  | 'embedded-importer';

export type ModuleLifecycleV1 = 'partial' | 'planned';
export type ModulePlatformV1 = 'web' | 'desktop' | 'android';

export interface ModuleCatalogEntryV1 {
  readonly id: ModuleIdV1;
  readonly requirementPrefix: string;
  readonly lifecycle: ModuleLifecycleV1;
  readonly title: Readonly<{
    readonly vi: string;
    readonly en: string;
  }>;
  readonly platforms: readonly ModulePlatformV1[];
  readonly workflowStages: readonly string[];
}

function freezeEntry(entry: ModuleCatalogEntryV1): ModuleCatalogEntryV1 {
  return Object.freeze({
    ...entry,
    title: Object.freeze({ ...entry.title }),
    platforms: Object.freeze([...entry.platforms]),
    workflowStages: Object.freeze([...entry.workflowStages]),
  });
}

const MODULE_CATALOG_V1: readonly ModuleCatalogEntryV1[] = Object.freeze([
  freezeEntry({
    id: 'folder-autopilot',
    requirementPrefix: 'FA',
    lifecycle: 'planned',
    title: { vi: 'Tự động hóa thư mục', en: 'Folder Autopilot' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['authorize', 'preview', 'approve', 'execute', 'recover'],
  }),
  freezeEntry({
    id: 'spreadsheet-auditor',
    requirementPrefix: 'SA',
    lifecycle: 'partial',
    title: { vi: 'Kiểm toán bảng tính', en: 'Spreadsheet Auditor' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['audit', 'repair-plan', 'review', 'approve', 'recheck'],
  }),
  freezeEntry({
    id: 'quote-intelligence',
    requirementPrefix: 'QI',
    lifecycle: 'planned',
    title: { vi: 'Phân tích báo giá', en: 'Quote Intelligence' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['compare', 'score', 'review', 'approve', 'reuse'],
  }),
  freezeEntry({
    id: 'operations-capture',
    requirementPrefix: 'OC',
    lifecycle: 'partial',
    title: { vi: 'Thu thập vận hành', en: 'Operations Capture' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['design', 'capture', 'submit', 'review', 'reconcile'],
  }),
  freezeEntry({
    id: 'invoice-leak-detector',
    requirementPrefix: 'ILD',
    lifecycle: 'planned',
    title: { vi: 'Phát hiện thất thoát hóa đơn', en: 'Invoice Leak Detector' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['ingest', 'match', 'review', 'evidence', 'approve'],
  }),
  freezeEntry({
    id: 'client-report-factory',
    requirementPrefix: 'CRF',
    lifecycle: 'planned',
    title: { vi: 'Xưởng báo cáo khách hàng', en: 'Client Report Factory' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['template', 'generate', 'review', 'approve', 'release'],
  }),
  freezeEntry({
    id: 'private-data-analyst',
    requirementPrefix: 'PDA',
    lifecycle: 'planned',
    title: { vi: 'Phân tích dữ liệu riêng tư', en: 'Private Data Analyst' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['govern', 'clarify', 'analyze', 'certify', 'schedule'],
  }),
  freezeEntry({
    id: 'migration-ready',
    requirementPrefix: 'MR',
    lifecycle: 'planned',
    title: { vi: 'Sẵn sàng di chuyển', en: 'Migration Ready' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['baseline', 'map', 'clean', 'dry-run', 'release'],
  }),
  freezeEntry({
    id: 'data-quality-guard',
    requirementPrefix: 'DQG',
    lifecycle: 'planned',
    title: { vi: 'Bảo vệ chất lượng dữ liệu', en: 'Data Quality Guard' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['contract', 'monitor', 'incident', 'repair', 'waive'],
  }),
  freezeEntry({
    id: 'embedded-importer',
    requirementPrefix: 'EI',
    lifecycle: 'planned',
    title: { vi: 'Trình nhập nhúng', en: 'Embedded Importer' },
    platforms: ['web', 'desktop', 'android'],
    workflowStages: ['configure', 'upload', 'validate', 'commit', 'observe'],
  }),
]);

export function listProductModulesV1(): readonly ModuleCatalogEntryV1[] {
  return MODULE_CATALOG_V1;
}

export function findProductModuleV1(id: ModuleIdV1): ModuleCatalogEntryV1 | undefined {
  return MODULE_CATALOG_V1.find((entry) => entry.id === id);
}
