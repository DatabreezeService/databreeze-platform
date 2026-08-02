import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DSM-022: governed-data export verification metadata without raw dataset values. */
export const DATASET_EXPORT_SCHEMA_VERSION_V1 = 1 as const;

export type DatasetExportFormatV1 = 'CSV' | 'JSONL' | 'PARQUET' | 'XLSX';
export type DatasetExportDataModeV1 = 'LOCAL' | 'HYBRID' | 'CLOUD';
export type DatasetExportPayloadClassV1 = 'GOVERNED_DATA' | 'APPROVED_DERIVED_RESULT';
export type DatasetExportApprovalStateV1 = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type DatasetExportQualityStateV1 = 'PASS' | 'PASS_WITH_WARNINGS' | 'BLOCKED' | 'INCOMPLETE';

export interface DatasetExportManifestV1 {
  readonly schemaVersion: typeof DATASET_EXPORT_SCHEMA_VERSION_V1;
  readonly manifestId: StableIdentifierV1;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly dataMode: DatasetExportDataModeV1;
  readonly payloadClass: DatasetExportPayloadClassV1;
  readonly format: DatasetExportFormatV1;
  readonly rowCount: number;
  readonly byteSize: number;
  readonly contentSha256: string;
  readonly schemaVersionId: StableIdentifierV1;
  readonly mappingVersionId: StableIdentifierV1;
  readonly ruleSetVersionId: StableIdentifierV1;
  readonly semanticManifestHash: string;
  readonly metricManifestHash: string;
  readonly qualityManifestHash: string;
  readonly lineageManifestHash: string;
  readonly evidenceManifestHash: string;
  readonly policyHash: string;
  readonly qualityState: DatasetExportQualityStateV1;
  readonly approvalState: DatasetExportApprovalStateV1;
  readonly createdAt: StrictUtcTimestampV1;
}

export type DatasetExportErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_MODE'
  | 'INVALID_PAYLOAD_CLASS'
  | 'INVALID_FORMAT'
  | 'INVALID_COUNT'
  | 'INVALID_SIZE'
  | 'INVALID_HASH'
  | 'INVALID_STATE'
  | 'INVALID_QUALITY_STATE'
  | 'INVALID_TIMESTAMP';

export type DatasetExportResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DatasetExportErrorCodeV1 };

const modes = new Set<DatasetExportDataModeV1>(['LOCAL', 'HYBRID', 'CLOUD']);
const payloadClasses = new Set<DatasetExportPayloadClassV1>([
  'GOVERNED_DATA',
  'APPROVED_DERIVED_RESULT',
]);
const formats = new Set<DatasetExportFormatV1>(['CSV', 'JSONL', 'PARQUET', 'XLSX']);
const qualityStates = new Set<DatasetExportQualityStateV1>([
  'PASS',
  'PASS_WITH_WARNINGS',
  'BLOCKED',
  'INCOMPLETE',
]);
const approvalStates = new Set<DatasetExportApprovalStateV1>([
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

function rejected(code: DatasetExportErrorCodeV1): DatasetExportResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function hash(input: unknown): string | undefined {
  return typeof input === 'string' && /^[0-9a-f]{64}$/u.test(input)
    ? input.toLowerCase()
    : undefined;
}

function timestamp(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

export function createDatasetExportManifestV1(input: {
  readonly manifestId: unknown;
  readonly datasetId: unknown;
  readonly datasetVersionId: unknown;
  readonly tenantScope: unknown;
  readonly dataMode: unknown;
  readonly payloadClass: unknown;
  readonly format: unknown;
  readonly rowCount: unknown;
  readonly byteSize: unknown;
  readonly contentSha256: unknown;
  readonly schemaVersionId: unknown;
  readonly mappingVersionId: unknown;
  readonly ruleSetVersionId: unknown;
  readonly semanticManifestHash: unknown;
  readonly metricManifestHash: unknown;
  readonly qualityManifestHash: unknown;
  readonly lineageManifestHash: unknown;
  readonly evidenceManifestHash: unknown;
  readonly policyHash: unknown;
  readonly qualityState: unknown;
  readonly approvalState: unknown;
  readonly createdAt: unknown;
}): DatasetExportResultV1<DatasetExportManifestV1> {
  const manifestId = identifier(input.manifestId);
  const datasetId = identifier(input.datasetId);
  const datasetVersionId = identifier(input.datasetVersionId);
  const schemaVersionId = identifier(input.schemaVersionId);
  const mappingVersionId = identifier(input.mappingVersionId);
  const ruleSetVersionId = identifier(input.ruleSetVersionId);
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const dataMode = input.dataMode;
  const payloadClass = input.payloadClass;
  const format = input.format;
  const contentSha256 = hash(input.contentSha256);
  const semanticManifestHash = hash(input.semanticManifestHash);
  const metricManifestHash = hash(input.metricManifestHash);
  const qualityManifestHash = hash(input.qualityManifestHash);
  const lineageManifestHash = hash(input.lineageManifestHash);
  const evidenceManifestHash = hash(input.evidenceManifestHash);
  const policyHash = hash(input.policyHash);
  const createdAt = timestamp(input.createdAt);
  if (
    !manifestId ||
    !datasetId ||
    !datasetVersionId ||
    !schemaVersionId ||
    !mappingVersionId ||
    !ruleSetVersionId
  )
    return rejected('INVALID_IDENTIFIER');
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!modes.has(dataMode as DatasetExportDataModeV1)) return rejected('INVALID_MODE');
  if (!payloadClasses.has(payloadClass as DatasetExportPayloadClassV1))
    return rejected('INVALID_PAYLOAD_CLASS');
  if (!formats.has(format as DatasetExportFormatV1)) return rejected('INVALID_FORMAT');
  if (
    typeof input.rowCount !== 'number' ||
    !Number.isSafeInteger(input.rowCount) ||
    input.rowCount < 0
  )
    return rejected('INVALID_COUNT');
  if (
    typeof input.byteSize !== 'number' ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0
  )
    return rejected('INVALID_SIZE');
  if (
    !contentSha256 ||
    !semanticManifestHash ||
    !metricManifestHash ||
    !qualityManifestHash ||
    !lineageManifestHash ||
    !evidenceManifestHash ||
    !policyHash
  )
    return rejected('INVALID_HASH');
  if (!qualityStates.has(input.qualityState as DatasetExportQualityStateV1))
    return rejected('INVALID_QUALITY_STATE');
  if (!approvalStates.has(input.approvalState as DatasetExportApprovalStateV1))
    return rejected('INVALID_STATE');
  if (!createdAt) return rejected('INVALID_TIMESTAMP');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DATASET_EXPORT_SCHEMA_VERSION_V1,
      manifestId,
      datasetId,
      datasetVersionId,
      tenantScope: tenantScope.value,
      dataMode: dataMode as DatasetExportDataModeV1,
      payloadClass: payloadClass as DatasetExportPayloadClassV1,
      format: format as DatasetExportFormatV1,
      rowCount: input.rowCount,
      byteSize: input.byteSize,
      contentSha256,
      schemaVersionId,
      mappingVersionId,
      ruleSetVersionId,
      semanticManifestHash,
      metricManifestHash,
      qualityManifestHash,
      lineageManifestHash,
      evidenceManifestHash,
      policyHash,
      qualityState: input.qualityState as DatasetExportQualityStateV1,
      approvalState: input.approvalState as DatasetExportApprovalStateV1,
      createdAt,
    }),
  });
}
