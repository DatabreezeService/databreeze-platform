import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** CRF-001..CRF-020: deterministic report model, evidence, and release binding. */
export const CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1 = 1 as const;

export type ClientReportFormatV1 = 'DOCX' | 'PPTX' | 'XLSX' | 'PDF' | 'WEB';
export type ClientReportBlockTypeV1 = 'TEXT' | 'METRIC';
export type ClientReportAggregationV1 = 'SUM' | 'COUNT' | 'AVERAGE';

export interface ClientReportMetricBlockV1 {
  readonly blockId: string;
  readonly type: 'METRIC';
  readonly label: string;
  readonly field: string;
  readonly aggregation: ClientReportAggregationV1;
  readonly metricVersionId: StableIdentifierV1;
}

export interface ClientReportTextBlockV1 {
  readonly blockId: string;
  readonly type: 'TEXT';
  readonly text: string;
}

export type ClientReportBlockV1 = ClientReportMetricBlockV1 | ClientReportTextBlockV1;

export interface ClientReportTemplateV1 {
  readonly templateId: StableIdentifierV1;
  readonly templateVersion: number;
  readonly tenantScope: TenantScopeV1;
  readonly supportedFormats: readonly ClientReportFormatV1[];
  readonly blocks: readonly ClientReportBlockV1[];
}

export interface ClientReportEvidenceReferenceV1 {
  readonly sourceId: StableIdentifierV1;
  readonly locator: string;
}

export interface ClientReportDataV1 {
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly rowEvidence: Readonly<Record<string, readonly ClientReportEvidenceReferenceV1[]>>;
}

export interface ClientReportFactV1 {
  readonly factId: string;
  readonly blockId: string;
  readonly label: string;
  readonly value: number;
  readonly metricVersionId: StableIdentifierV1;
  readonly completeness: 'COMPLETE' | 'PARTIAL' | 'BLOCKED';
}

export interface ClientReportEvidenceManifestV1 {
  readonly factId: string;
  readonly references: readonly ClientReportEvidenceReferenceV1[];
}

export interface ClientReportOutputV1 {
  readonly format: ClientReportFormatV1;
  readonly contentHash: string;
  readonly validationState: 'VALIDATED';
}

export interface ClientReportV1 {
  readonly schemaVersion: typeof CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1;
  readonly reportId: StableIdentifierV1;
  readonly reportVersion: number;
  readonly tenantScope: TenantScopeV1;
  readonly clientId: StableIdentifierV1;
  readonly period: string;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly templateId: StableIdentifierV1;
  readonly templateVersion: number;
  readonly facts: readonly ClientReportFactV1[];
  readonly evidenceManifest: readonly ClientReportEvidenceManifestV1[];
  readonly outputs: readonly ClientReportOutputV1[];
  readonly contentHash: string;
}

export type ClientReportGenerationResultV1 =
  | { readonly status: 'READY'; readonly report: ClientReportV1 }
  | { readonly status: 'BLOCKED'; readonly reasons: readonly string[] };

export type ClientReportReleaseResultV1 =
  | {
      readonly status: 'RELEASED';
      readonly report: ClientReportV1;
      readonly jraApprovalRequestId: StableIdentifierV1;
    }
  | { readonly status: 'BLOCKED'; readonly reasons: readonly string[] };

function id(input: unknown): StableIdentifierV1 | undefined {
  const result = parseStableIdentifierV1(input);
  return result.accepted ? result.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const result = parseTenantScopeV1(input);
  return result.accepted ? result.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function text(input: unknown, maximum: number): string | undefined {
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > maximum ||
    /\p{Cc}/u.test(input)
  )
    return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function stableValue(input: unknown): string {
  if (input === null) return 'null';
  if (input === undefined) return 'undefined';
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
    return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(stableValue).join(',')}]`;
  const object = input as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`)
    .join(',')}}`;
}

function diagnosticHash(input: unknown): string {
  const serialized = stableValue(input);
  let hashValue = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hashValue ^= serialized.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(16).padStart(8, '0').repeat(8);
}

function aggregationValue(
  rows: readonly Readonly<Record<string, unknown>>[],
  field: string,
  aggregation: ClientReportAggregationV1,
): number | undefined {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (aggregation === 'COUNT') return rows.length;
  if (values.length === 0) return undefined;
  if (aggregation === 'SUM') return values.reduce((sum, value) => sum + value, 0);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function generateClientReportV1(input: {
  readonly reportId: unknown;
  readonly reportVersion: unknown;
  readonly tenantScope: unknown;
  readonly clientId: unknown;
  readonly period: unknown;
  readonly template: unknown;
  readonly data: unknown;
}): ClientReportGenerationResultV1 {
  const reportId = id(input.reportId);
  const clientId = id(input.clientId);
  const tenantScope = scope(input.tenantScope);
  const period = text(input.period, 64);
  if (
    !reportId ||
    !clientId ||
    !tenantScope ||
    !period ||
    !Number.isSafeInteger(input.reportVersion) ||
    (input.reportVersion as number) < 1
  )
    return { status: 'BLOCKED', reasons: ['INVALID_REPORT_IDENTITY'] };
  if (
    !input.template ||
    typeof input.template !== 'object' ||
    !input.data ||
    typeof input.data !== 'object'
  )
    return { status: 'BLOCKED', reasons: ['INVALID_INPUT'] };
  const templateInput = input.template as Record<string, unknown>;
  const templateId = id(templateInput['templateId']);
  const templateScope = scope(templateInput['tenantScope']);
  const templateVersion = templateInput['templateVersion'];
  const formats = templateInput['supportedFormats'];
  const rawBlocks = templateInput['blocks'];
  if (
    !templateId ||
    !templateScope ||
    !tenantScopesEqualV1(tenantScope, templateScope) ||
    !Number.isSafeInteger(templateVersion) ||
    (templateVersion as number) < 1 ||
    !Array.isArray(formats) ||
    formats.length === 0 ||
    formats.some(
      (format) =>
        format !== 'DOCX' &&
        format !== 'PPTX' &&
        format !== 'XLSX' &&
        format !== 'PDF' &&
        format !== 'WEB',
    ) ||
    !Array.isArray(rawBlocks) ||
    rawBlocks.length > 200
  )
    return { status: 'BLOCKED', reasons: ['INVALID_TEMPLATE'] };
  const dataInput = input.data as Record<string, unknown>;
  const datasetId = id(dataInput['datasetId']);
  const datasetVersionId = id(dataInput['datasetVersionId']);
  const contentSha256 = hash(dataInput['contentSha256']);
  const rows = dataInput['rows'];
  const rowEvidence = dataInput['rowEvidence'];
  if (
    !datasetId ||
    !datasetVersionId ||
    !contentSha256 ||
    !Array.isArray(rows) ||
    rows.length > 1_000_000 ||
    !rowEvidence ||
    typeof rowEvidence !== 'object' ||
    Array.isArray(rowEvidence)
  )
    return { status: 'BLOCKED', reasons: ['INVALID_DATASET_BINDING'] };
  const blockIds = new Set<string>();
  const blocks: ClientReportBlockV1[] = [];
  for (const candidate of rawBlocks) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return { status: 'BLOCKED', reasons: ['INVALID_BLOCK'] };
    const record = candidate as Record<string, unknown>;
    const blockId = text(record['blockId'], 96);
    if (!blockId || blockIds.has(blockId))
      return { status: 'BLOCKED', reasons: ['DUPLICATE_BLOCK_ID'] };
    blockIds.add(blockId);
    if (record['type'] === 'TEXT') {
      const blockText = text(record['text'], 4_000);
      if (!blockText) return { status: 'BLOCKED', reasons: ['INVALID_TEXT_BLOCK'] };
      blocks.push(Object.freeze({ blockId, type: 'TEXT', text: blockText }));
      continue;
    }
    const metricVersionId = id(record['metricVersionId']);
    const label = text(record['label'], 128);
    const field = text(record['field'], 128);
    const aggregation = record['aggregation'];
    if (
      !metricVersionId ||
      !label ||
      !field ||
      (aggregation !== 'SUM' && aggregation !== 'COUNT' && aggregation !== 'AVERAGE')
    )
      return { status: 'BLOCKED', reasons: ['INVALID_METRIC_BLOCK'] };
    blocks.push(
      Object.freeze({ blockId, type: 'METRIC', label, field, aggregation, metricVersionId }),
    );
  }
  const facts: ClientReportFactV1[] = [];
  const evidenceManifest: ClientReportEvidenceManifestV1[] = [];
  for (const block of blocks) {
    if (block.type !== 'METRIC') continue;
    const value = aggregationValue(
      rows as Readonly<Record<string, unknown>>[],
      block.field,
      block.aggregation,
    );
    if (value === undefined)
      return { status: 'BLOCKED', reasons: [`MISSING_METRIC_DATA:${block.blockId}`] };
    const factId = `fact-${diagnosticHash([reportId, String(input.reportVersion), block.blockId, datasetVersionId, value]).slice(0, 32)}`;
    const references: ClientReportEvidenceReferenceV1[] = [];
    for (const row of rows as Readonly<Record<string, unknown>>[]) {
      const rowId = text(row['rowId'], 128);
      if (!rowId) return { status: 'BLOCKED', reasons: ['ROW_ID_REQUIRED'] };
      const refs = (rowEvidence as Record<string, unknown>)[rowId];
      if (!Array.isArray(refs))
        return { status: 'BLOCKED', reasons: [`EVIDENCE_MISSING:${rowId}`] };
      for (const reference of refs) {
        if (!reference || typeof reference !== 'object' || Array.isArray(reference))
          return { status: 'BLOCKED', reasons: [`EVIDENCE_INVALID:${rowId}`] };
        const sourceId = id((reference as Record<string, unknown>)['sourceId']);
        const locator = text((reference as Record<string, unknown>)['locator'], 256);
        if (!sourceId || !locator)
          return { status: 'BLOCKED', reasons: [`EVIDENCE_INVALID:${rowId}`] };
        references.push(Object.freeze({ sourceId, locator }));
      }
    }
    facts.push(
      Object.freeze({
        factId,
        blockId: block.blockId,
        label: block.label,
        value,
        metricVersionId: block.metricVersionId,
        completeness: 'COMPLETE',
      }),
    );
    evidenceManifest.push(Object.freeze({ factId, references: Object.freeze(references) }));
  }
  const contentHash = diagnosticHash({
    reportId,
    reportVersion: input.reportVersion,
    tenantScope,
    clientId,
    period,
    templateId,
    templateVersion,
    datasetId,
    datasetVersionId,
    blocks,
    facts,
    evidenceManifest,
  });
  const outputs = Object.freeze(
    (formats as ClientReportFormatV1[]).map((format) =>
      Object.freeze({
        format,
        contentHash: diagnosticHash([contentHash, format]),
        validationState: 'VALIDATED' as const,
      }),
    ),
  );
  return {
    status: 'READY',
    report: Object.freeze({
      schemaVersion: CLIENT_REPORT_FACTORY_SCHEMA_VERSION_V1,
      reportId,
      reportVersion: input.reportVersion as number,
      tenantScope,
      clientId,
      period,
      datasetId,
      datasetVersionId,
      templateId,
      templateVersion: templateVersion as number,
      facts: Object.freeze(facts),
      evidenceManifest: Object.freeze(evidenceManifest),
      outputs,
      contentHash,
    }),
  };
}

export function releaseClientReportV1(
  report: ClientReportV1,
  approval: {
    readonly approved: boolean;
    readonly requestedAction: string;
    readonly subjectType: string;
    readonly subjectId: unknown;
    readonly subjectVersion: string;
    readonly subjectHash: unknown;
    readonly jraApprovalRequestId: unknown;
  },
): ClientReportReleaseResultV1 {
  const subjectId = id(approval.subjectId);
  const subjectHash = hash(approval.subjectHash);
  const jraApprovalRequestId = id(approval.jraApprovalRequestId);
  if (
    !approval.approved ||
    approval.requestedAction !== 'RELEASE' ||
    approval.subjectType !== 'CLIENT_REPORT' ||
    subjectId !== report.reportId ||
    approval.subjectVersion !== String(report.reportVersion) ||
    subjectHash !== report.contentHash ||
    !jraApprovalRequestId
  )
    return { status: 'BLOCKED', reasons: ['EXACT_SUBJECT_REQUIRED'] };
  return { status: 'RELEASED', report, jraApprovalRequestId };
}
