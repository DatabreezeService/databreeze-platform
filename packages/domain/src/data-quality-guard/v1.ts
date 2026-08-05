import { parseStableIdentifierV1, type StableIdentifierV1 } from '../tenant-scope/v1.js';

/** DQG-001..DQG-022: local deterministic quality contracts and repair proposals. */
export const DATA_QUALITY_GUARD_SCHEMA_VERSION_V1 = 1 as const;

export type DataQualityScalarV1 = string | number | boolean | null | undefined;
export type DataQualityRowV1 = Readonly<Record<string, DataQualityScalarV1>>;
export type DataQualitySeverityV1 = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type DataQualityResultStateV1 = 'PASS' | 'FAIL' | 'NOT_EVALUATED' | 'ERROR';
export type DataQualityRuleKindV1 = 'required' | 'unique' | 'range' | 'allowed-set' | 'type';

export interface DataQualityDatasetV1 {
  readonly schemaVersion: typeof DATA_QUALITY_GUARD_SCHEMA_VERSION_V1;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly contentSha256: string;
  readonly rows: readonly DataQualityRowV1[];
}

export interface DataQualityRuleV1 {
  readonly ruleId: StableIdentifierV1;
  readonly kind: DataQualityRuleKindV1;
  readonly field: string;
  readonly severity: DataQualitySeverityV1;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly DataQualityScalarV1[];
  readonly expectedType?: 'string' | 'number' | 'boolean' | 'date';
  readonly allowNull: boolean;
}

export interface DataQualityContractV1 {
  readonly contractId: StableIdentifierV1;
  readonly contractVersion: number;
  readonly contractSha256: string;
  readonly rules: readonly DataQualityRuleV1[];
}

export interface DataQualityFindingV1 {
  readonly findingId: string;
  readonly fingerprint: string;
  readonly ruleId: StableIdentifierV1;
  readonly reasonCode: string;
  readonly severity: DataQualitySeverityV1;
  readonly rowNumber: number;
  readonly field: string;
  readonly valueKind: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'NULL' | 'MISSING';
  readonly valueFingerprint: string;
  readonly evidence: {
    readonly datasetVersionId: StableIdentifierV1;
    readonly locator: string;
  };
}

export interface DataQualityRuleResultV1 {
  readonly ruleId: StableIdentifierV1;
  readonly kind: DataQualityRuleKindV1;
  readonly state: DataQualityResultStateV1;
  readonly denominator: number;
  readonly affectedCount: number;
  readonly reasonCode: string;
  readonly findingIds: readonly string[];
}

export interface DataQualityRunSummaryV1 {
  readonly state: 'PASS' | 'FAIL';
  readonly totalRules: number;
  readonly passedRules: number;
  readonly failedRules: number;
  readonly notEvaluatedRules: number;
  readonly errorRules: number;
  readonly passRate: number;
}

export interface DataQualityRunV1 {
  readonly schemaVersion: typeof DATA_QUALITY_GUARD_SCHEMA_VERSION_V1;
  readonly runId: string;
  readonly datasetId: StableIdentifierV1;
  readonly datasetVersionId: StableIdentifierV1;
  readonly datasetContentSha256: string;
  readonly contractId: StableIdentifierV1;
  readonly contractVersion: number;
  readonly contractSha256: string;
  readonly ruleResults: readonly DataQualityRuleResultV1[];
  readonly findings: readonly DataQualityFindingV1[];
  readonly summary: DataQualityRunSummaryV1;
}

export interface DataQualityRepairOperationV1 {
  readonly rowNumber: number;
  readonly field: string;
  readonly replacement: DataQualityScalarV1;
  readonly reasonCode: string;
}

export interface DataQualityRepairProposalV1 {
  readonly schemaVersion: typeof DATA_QUALITY_GUARD_SCHEMA_VERSION_V1;
  readonly proposalId: string;
  readonly sourceDatasetId: StableIdentifierV1;
  readonly sourceDatasetVersionId: StableIdentifierV1;
  readonly qualityRunId: string;
  readonly operations: readonly DataQualityRepairOperationV1[];
  readonly planFingerprint: string;
}

export interface DataQualityRepairPreviewV1 {
  readonly proposalId: string;
  readonly affectedRows: number;
  readonly operations: number;
  readonly beforeAfter: readonly {
    readonly rowNumber: number;
    readonly field: string;
    readonly before: DataQualityScalarV1;
    readonly after: DataQualityScalarV1;
  }[];
  readonly derivedContentFingerprint: string;
}

export interface RepairedDataQualityDatasetV1 extends DataQualityDatasetV1 {
  readonly sourceDatasetId: StableIdentifierV1;
  readonly sourceDatasetVersionId: StableIdentifierV1;
  readonly repairProposalId: string;
  readonly evidence: readonly {
    readonly rowNumber: number;
    readonly field: string;
    readonly beforeFingerprint: string;
    readonly afterFingerprint: string;
  }[];
}

function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
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

function scalarFingerprint(value: DataQualityScalarV1): string {
  const serialized = value === undefined ? 'undefined' : JSON.stringify(value);
  let hashValue = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hashValue ^= serialized.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  const short = (hashValue >>> 0).toString(16).padStart(8, '0');
  return `dqg-${short.repeat(8)}`;
}

function fingerprint(parts: readonly string[]): string {
  return scalarFingerprint(parts.join('|'));
}

function valueKind(value: DataQualityScalarV1): DataQualityFindingV1['valueKind'] {
  if (value === undefined) return 'MISSING';
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(value)) return 'DATE';
  return 'TEXT';
}

function sameValue(left: DataQualityScalarV1, right: DataQualityScalarV1): boolean {
  return Object.is(left, right);
}

function fail(code: string): never {
  throw new Error(code);
}

function normalizeRule(input: unknown): DataQualityRuleV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_RULE');
  const record = input as Record<string, unknown>;
  const ruleId = id(record['ruleId']);
  const field = text(record['field'], 128);
  const kind = record['kind'];
  const severity = record['severity'] ?? 'ERROR';
  const allowNull = record['allowNull'] === true;
  if (
    !ruleId ||
    !field ||
    (kind !== 'required' &&
      kind !== 'unique' &&
      kind !== 'range' &&
      kind !== 'allowed-set' &&
      kind !== 'type')
  )
    return fail('INVALID_RULE');
  if (
    severity !== 'INFO' &&
    severity !== 'WARNING' &&
    severity !== 'ERROR' &&
    severity !== 'CRITICAL'
  )
    return fail('INVALID_RULE');
  const min = record['min'];
  const max = record['max'];
  if (
    kind === 'range' &&
    (min !== undefined || max !== undefined) &&
    ((min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) ||
      (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) ||
      (min !== undefined && max !== undefined && min > max))
  )
    return fail('INVALID_RULE');
  const values = record['values'];
  if (
    kind === 'allowed-set' &&
    (!Array.isArray(values) || values.length === 0 || values.length > 256)
  )
    return fail('INVALID_RULE');
  const expectedType = record['expectedType'];
  if (
    kind === 'type' &&
    expectedType !== 'string' &&
    expectedType !== 'number' &&
    expectedType !== 'boolean' &&
    expectedType !== 'date'
  )
    return fail('INVALID_RULE');
  const normalizedExpectedType = expectedType as DataQualityRuleV1['expectedType'];
  return Object.freeze({
    ruleId,
    kind,
    field,
    severity,
    allowNull,
    ...(min === undefined ? {} : { min: min as number }),
    ...(max === undefined ? {} : { max: max as number }),
    ...(values === undefined
      ? {}
      : { values: Object.freeze([...(values as DataQualityScalarV1[])]) }),
    ...(normalizedExpectedType === undefined ? {} : { expectedType: normalizedExpectedType }),
  });
}

export function createDataQualityDatasetV1(input: {
  readonly datasetId: unknown;
  readonly datasetVersionId: unknown;
  readonly contentSha256: unknown;
  readonly rows: unknown;
}): DataQualityDatasetV1 {
  const datasetId = id(input.datasetId);
  const datasetVersionId = id(input.datasetVersionId);
  const contentSha256 = hash(input.contentSha256);
  if (
    !datasetId ||
    !datasetVersionId ||
    !contentSha256 ||
    !Array.isArray(input.rows) ||
    input.rows.length > 1_000_000
  )
    return fail('INVALID_DATASET');
  const rows = input.rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('INVALID_DATASET');
    return Object.freeze({ ...(row as DataQualityRowV1) });
  });
  return Object.freeze({
    schemaVersion: DATA_QUALITY_GUARD_SCHEMA_VERSION_V1,
    datasetId,
    datasetVersionId,
    contentSha256,
    rows: Object.freeze(rows),
  });
}

export function evaluateDataQualityContractV1(
  dataset: DataQualityDatasetV1,
  input: {
    readonly contractId: unknown;
    readonly contractVersion: unknown;
    readonly contractSha256: unknown;
    readonly rules: unknown;
  },
): DataQualityRunV1 {
  const contractId = id(input.contractId);
  const contractSha256 = hash(input.contractSha256);
  if (
    !contractId ||
    !Number.isSafeInteger(input.contractVersion) ||
    (input.contractVersion as number) < 1 ||
    !contractSha256 ||
    !Array.isArray(input.rules) ||
    input.rules.length > 512
  )
    return fail('INVALID_CONTRACT');
  const rules = input.rules.map(normalizeRule);
  if (new Set(rules.map((rule) => rule.ruleId)).size !== rules.length)
    return fail('DUPLICATE_RULE_ID');
  const findings: DataQualityFindingV1[] = [];
  const ruleResults: DataQualityRuleResultV1[] = [];
  for (const rule of rules) {
    const findingIds: string[] = [];
    let affectedCount = 0;
    const consideredRows = dataset.rows.filter(
      (row) => !(rule.allowNull && (row[rule.field] === null || row[rule.field] === undefined)),
    );
    const addFinding = (rowNumber: number, value: DataQualityScalarV1, reasonCode: string) => {
      affectedCount += 1;
      const stable = fingerprint([
        dataset.datasetVersionId,
        rule.ruleId,
        String(rowNumber),
        rule.field,
        reasonCode,
        scalarFingerprint(value),
      ]);
      const findingId = `finding-${stable}`;
      findingIds.push(findingId);
      findings.push(
        Object.freeze({
          findingId,
          fingerprint: stable,
          ruleId: rule.ruleId,
          reasonCode,
          severity: rule.severity,
          rowNumber,
          field: rule.field,
          valueKind: valueKind(value),
          valueFingerprint: scalarFingerprint(value),
          evidence: Object.freeze({
            datasetVersionId: dataset.datasetVersionId,
            locator: `row:${rowNumber}:field:${rule.field}`,
          }),
        }),
      );
    };
    dataset.rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const value = row[rule.field];
      let invalid = false;
      const reasonCode = `DQG_${rule.kind.toUpperCase()}`;
      if (rule.kind === 'required')
        invalid =
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim().length === 0);
      else if (rule.kind === 'unique')
        invalid =
          value !== undefined &&
          value !== null &&
          dataset.rows.slice(0, index).some((candidate) => sameValue(candidate[rule.field], value));
      else if (rule.kind === 'range')
        invalid =
          typeof value !== 'number' ||
          (rule.min !== undefined && value < rule.min) ||
          (rule.max !== undefined && value > rule.max);
      else if (rule.kind === 'allowed-set')
        invalid = !rule.values?.some((candidate) => sameValue(candidate, value));
      else if (rule.kind === 'type')
        invalid =
          rule.expectedType === 'number'
            ? typeof value !== 'number'
            : rule.expectedType === 'boolean'
              ? typeof value !== 'boolean'
              : rule.expectedType === 'date'
                ? typeof value !== 'string' || Number.isNaN(Date.parse(value))
                : typeof value !== 'string';
      if (invalid) addFinding(rowNumber, value, reasonCode);
    });
    const state: DataQualityResultStateV1 = affectedCount === 0 ? 'PASS' : 'FAIL';
    ruleResults.push(
      Object.freeze({
        ruleId: rule.ruleId,
        kind: rule.kind,
        state,
        denominator: consideredRows.length,
        affectedCount,
        reasonCode: state === 'PASS' ? 'PASS' : `DQG_${rule.kind.toUpperCase()}`,
        findingIds: Object.freeze(findingIds),
      }),
    );
  }
  const failedRules = ruleResults.filter((result) => result.state === 'FAIL').length;
  const passedRules = ruleResults.filter((result) => result.state === 'PASS').length;
  const summary = Object.freeze({
    state: failedRules > 0 ? ('FAIL' as const) : ('PASS' as const),
    totalRules: rules.length,
    passedRules,
    failedRules,
    notEvaluatedRules: ruleResults.filter((result) => result.state === 'NOT_EVALUATED').length,
    errorRules: ruleResults.filter((result) => result.state === 'ERROR').length,
    passRate: rules.length === 0 ? 1 : passedRules / rules.length,
  });
  return Object.freeze({
    schemaVersion: DATA_QUALITY_GUARD_SCHEMA_VERSION_V1,
    runId: `run-${fingerprint([dataset.datasetVersionId, contractId, String(input.contractVersion), dataset.contentSha256, contractSha256])}`,
    datasetId: dataset.datasetId,
    datasetVersionId: dataset.datasetVersionId,
    datasetContentSha256: dataset.contentSha256,
    contractId,
    contractVersion: input.contractVersion as number,
    contractSha256,
    ruleResults: Object.freeze(ruleResults),
    findings: Object.freeze(findings),
    summary,
  });
}

export function createDataQualityRepairProposalV1(
  dataset: DataQualityDatasetV1,
  run: DataQualityRunV1,
  operations: readonly DataQualityRepairOperationV1[],
): DataQualityRepairProposalV1 {
  if (run.datasetVersionId !== dataset.datasetVersionId || operations.length > 10_000)
    return fail('INVALID_REPAIR');
  const normalized = operations.map((operation) => {
    if (
      !Number.isSafeInteger(operation.rowNumber) ||
      operation.rowNumber < 1 ||
      operation.rowNumber > dataset.rows.length ||
      !text(operation.field, 128) ||
      !text(operation.reasonCode, 96)
    )
      return fail('INVALID_REPAIR');
    return Object.freeze({ ...operation });
  });
  const planFingerprint = fingerprint([
    run.runId,
    ...normalized.map(
      (operation) =>
        `${operation.rowNumber}:${operation.field}:${scalarFingerprint(operation.replacement)}:${operation.reasonCode}`,
    ),
  ]);
  return Object.freeze({
    schemaVersion: DATA_QUALITY_GUARD_SCHEMA_VERSION_V1,
    proposalId: `repair-${planFingerprint}`,
    sourceDatasetId: dataset.datasetId,
    sourceDatasetVersionId: dataset.datasetVersionId,
    qualityRunId: run.runId,
    operations: Object.freeze(normalized),
    planFingerprint,
  });
}

export function previewDataQualityRepairV1(
  dataset: DataQualityDatasetV1,
  proposal: DataQualityRepairProposalV1,
): DataQualityRepairPreviewV1 {
  if (proposal.sourceDatasetVersionId !== dataset.datasetVersionId) return fail('INVALID_REPAIR');
  const beforeAfter = proposal.operations.map((operation) =>
    Object.freeze({
      rowNumber: operation.rowNumber,
      field: operation.field,
      before: dataset.rows[operation.rowNumber - 1]?.[operation.field],
      after: operation.replacement,
    }),
  );
  return Object.freeze({
    proposalId: proposal.proposalId,
    affectedRows: new Set(beforeAfter.map((entry) => entry.rowNumber)).size,
    operations: beforeAfter.length,
    beforeAfter: Object.freeze(beforeAfter),
    derivedContentFingerprint: fingerprint([dataset.contentSha256, proposal.planFingerprint]),
  });
}

export function applyDataQualityRepairV1(
  dataset: DataQualityDatasetV1,
  proposal: DataQualityRepairProposalV1,
): RepairedDataQualityDatasetV1 {
  const preview = previewDataQualityRepairV1(dataset, proposal);
  const rows = dataset.rows.map((row) => ({ ...row }));
  const evidence: RepairedDataQualityDatasetV1['evidence'][number][] = [];
  for (const operation of proposal.operations) {
    const target = rows[operation.rowNumber - 1];
    if (!target) return fail('INVALID_REPAIR');
    const before = target[operation.field];
    target[operation.field] = operation.replacement;
    evidence.push(
      Object.freeze({
        rowNumber: operation.rowNumber,
        field: operation.field,
        beforeFingerprint: scalarFingerprint(before),
        afterFingerprint: scalarFingerprint(operation.replacement),
      }),
    );
  }
  const derivedSuffix = preview.derivedContentFingerprint
    .replace(/[^0-9a-f]/gu, '')
    .slice(-12)
    .padStart(12, '0');
  const derivedVersionId = `00000000-0000-4000-8000-${derivedSuffix}` as StableIdentifierV1;
  const derivedContentSha256 = preview.derivedContentFingerprint
    .replace(/[^0-9a-f]/gu, '')
    .padEnd(64, '0')
    .slice(0, 64);
  return Object.freeze({
    schemaVersion: DATA_QUALITY_GUARD_SCHEMA_VERSION_V1,
    datasetId: dataset.datasetId,
    datasetVersionId: derivedVersionId,
    contentSha256: derivedContentSha256,
    rows: Object.freeze(rows.map((row) => Object.freeze(row))),
    sourceDatasetId: dataset.datasetId,
    sourceDatasetVersionId: dataset.datasetVersionId,
    repairProposalId: proposal.proposalId,
    evidence: Object.freeze(evidence),
  });
}
