import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '../tenant-scope/v1.js';

/** DDA-043..DDA-046: untrusted content, AI egress, retention, and audit boundaries. */
export const DDA_POLICY_SCHEMA_VERSION_V1 = 1 as const;

export type DdaAiLocalityV1 = 'LOCAL' | 'CLOUD' | 'DENIED';
export type DdaAiPurposeV1 =
  | 'PLAN_PROPOSAL'
  | 'NARRATIVE'
  | 'MAPPING_SUGGESTION'
  | 'RECEIPT_EXTRACTION'
  | 'DISABLED';

export interface DdaAiEgressPolicyV1 {
  readonly schemaVersion: typeof DDA_POLICY_SCHEMA_VERSION_V1;
  readonly policyId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly enabled: boolean;
  readonly adapterAllowlist: readonly string[];
  readonly locality: DdaAiLocalityV1;
  readonly purposeAllowlist: readonly DdaAiPurposeV1[];
  readonly allowMetadata: boolean;
  readonly allowSamples: boolean;
  readonly allowResultRows: boolean;
  readonly allowEvidence: boolean;
  readonly retentionDays: number;
  readonly maximumPayloadBytes: number;
}

declare const untrustedContentBrand: unique symbol;

export type UntrustedSourceContentV1 = string & {
  readonly [untrustedContentBrand]: 'UntrustedSourceContentV1';
};

export type DdaContentBoundaryV1 =
  | 'SYSTEM_INSTRUCTION'
  | 'TOOL_SELECTION'
  | 'PLAN_MUTATION'
  | 'CANVAS_MUTATION'
  | 'PUBLICATION'
  | 'TRANSFER'
  | 'PERMISSION_CHANGE'
  | 'EGRESS';

export type DdaPolicyErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE'
  | 'INVALID_POLICY'
  | 'AI_EGRESS_DENIED'
  | 'UNTRUSTED_CONTENT_REJECTED'
  | 'RETENTION_OWNERSHIP';

export type DdaPolicyResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DdaPolicyErrorCodeV1 };

export interface DdaAuditSummaryV1 {
  readonly action: string;
  readonly outcome: string;
  readonly correlationId: StableIdentifierV1;
  readonly referenceIds: readonly StableIdentifierV1[];
  readonly tenantScope: TenantScopeV1;
}

export interface DdaRetentionConstraintV1 {
  readonly artifactVersionId: StableIdentifierV1;
  readonly tenantScope: TenantScopeV1;
  readonly holdReason: string;
  readonly requestedBy: StableIdentifierV1;
}

const purposes = new Set<DdaAiPurposeV1>([
  'PLAN_PROPOSAL',
  'NARRATIVE',
  'MAPPING_SUGGESTION',
  'RECEIPT_EXTRACTION',
  'DISABLED',
]);
const localities = new Set<DdaAiLocalityV1>(['LOCAL', 'CLOUD', 'DENIED']);

function rejected(code: DdaPolicyErrorCodeV1): DdaPolicyResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function identifier(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function scope(input: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

export function brandUntrustedSourceContentV1(
  input: unknown,
): UntrustedSourceContentV1 | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > 10_000) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  return input.normalize('NFC') as UntrustedSourceContentV1;
}

export function createDdaAiEgressPolicyV1(input: {
  readonly policyId: unknown;
  readonly tenantScope: unknown;
  readonly enabled?: unknown;
  readonly adapterAllowlist?: unknown;
  readonly locality?: unknown;
  readonly purposeAllowlist?: unknown;
  readonly allowMetadata?: unknown;
  readonly allowSamples?: unknown;
  readonly allowResultRows?: unknown;
  readonly allowEvidence?: unknown;
  readonly retentionDays?: unknown;
  readonly maximumPayloadBytes?: unknown;
}): DdaPolicyResultV1<DdaAiEgressPolicyV1> {
  const policyId = identifier(input.policyId);
  const tenantScope = scope(input.tenantScope);
  if (!policyId) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  const enabled = input.enabled === undefined ? false : input.enabled === true;
  const locality = input.locality === undefined ? 'DENIED' : (input.locality as DdaAiLocalityV1);
  if (!localities.has(locality)) return rejected('INVALID_POLICY');
  const adapters = Array.isArray(input.adapterAllowlist)
    ? input.adapterAllowlist.filter((value): value is string => typeof value === 'string')
    : [];
  const purposeAllowlist = Array.isArray(input.purposeAllowlist)
    ? input.purposeAllowlist.filter((value): value is DdaAiPurposeV1 =>
        purposes.has(value as DdaAiPurposeV1),
      )
    : (['DISABLED'] as DdaAiPurposeV1[]);
  const retentionDays =
    typeof input.retentionDays === 'number' && Number.isSafeInteger(input.retentionDays)
      ? input.retentionDays
      : 0;
  const maximumPayloadBytes =
    typeof input.maximumPayloadBytes === 'number' && Number.isSafeInteger(input.maximumPayloadBytes)
      ? input.maximumPayloadBytes
      : 0;
  if (retentionDays < 0 || maximumPayloadBytes < 0) return rejected('INVALID_POLICY');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: DDA_POLICY_SCHEMA_VERSION_V1,
      policyId,
      tenantScope,
      enabled,
      adapterAllowlist: Object.freeze(adapters),
      locality: enabled ? locality : 'DENIED',
      purposeAllowlist: Object.freeze(purposeAllowlist),
      allowMetadata: input.allowMetadata === true,
      allowSamples: input.allowSamples === true,
      allowResultRows: input.allowResultRows === true,
      allowEvidence: input.allowEvidence === true,
      retentionDays,
      maximumPayloadBytes,
    }),
  });
}

export function evaluateDdaAiEgressV1(
  policy: DdaAiEgressPolicyV1,
  request: {
    readonly adapter: string;
    readonly purpose: DdaAiPurposeV1;
    readonly payloadBytes: number;
    readonly includesSamples?: boolean;
    readonly includesResultRows?: boolean;
    readonly includesEvidence?: boolean;
  },
): DdaPolicyResultV1<{ readonly allowed: true }> {
  if (!policy.enabled || policy.locality === 'DENIED') return rejected('AI_EGRESS_DENIED');
  if (!policy.adapterAllowlist.includes(request.adapter)) return rejected('AI_EGRESS_DENIED');
  if (!policy.purposeAllowlist.includes(request.purpose)) return rejected('AI_EGRESS_DENIED');
  if (request.payloadBytes > policy.maximumPayloadBytes) return rejected('AI_EGRESS_DENIED');
  if (request.includesSamples && !policy.allowSamples) return rejected('AI_EGRESS_DENIED');
  if (request.includesResultRows && !policy.allowResultRows) return rejected('AI_EGRESS_DENIED');
  if (request.includesEvidence && !policy.allowEvidence) return rejected('AI_EGRESS_DENIED');
  return Object.freeze({ accepted: true, value: Object.freeze({ allowed: true as const }) });
}

export function authorizeUntrustedContentV1(
  content: UntrustedSourceContentV1,
  boundary: DdaContentBoundaryV1,
): DdaPolicyResultV1<{ readonly treatedAsDataOnly: true }> {
  void content;
  if (
    boundary === 'SYSTEM_INSTRUCTION' ||
    boundary === 'TOOL_SELECTION' ||
    boundary === 'PLAN_MUTATION' ||
    boundary === 'CANVAS_MUTATION' ||
    boundary === 'PUBLICATION' ||
    boundary === 'TRANSFER' ||
    boundary === 'PERMISSION_CHANGE' ||
    boundary === 'EGRESS'
  ) {
    return rejected('UNTRUSTED_CONTENT_REJECTED');
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({ treatedAsDataOnly: true as const }),
  });
}

export function createDdaAuditSummaryV1(input: {
  readonly action: unknown;
  readonly outcome: unknown;
  readonly correlationId: unknown;
  readonly referenceIds: unknown;
  readonly tenantScope: unknown;
  readonly forbiddenContent?: unknown;
}): DdaPolicyResultV1<DdaAuditSummaryV1> {
  const tenantScope = scope(input.tenantScope);
  const correlationId = identifier(input.correlationId);
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (!correlationId) return rejected('INVALID_IDENTIFIER');
  if (typeof input.action !== 'string' || input.action.length === 0) {
    return rejected('INVALID_POLICY');
  }
  if (typeof input.outcome !== 'string' || input.outcome.length === 0) {
    return rejected('INVALID_POLICY');
  }
  if (input.forbiddenContent !== undefined) return rejected('INVALID_POLICY');
  if (!Array.isArray(input.referenceIds)) return rejected('INVALID_POLICY');
  const referenceIds: StableIdentifierV1[] = [];
  for (const value of input.referenceIds) {
    const id = identifier(value);
    if (!id) return rejected('INVALID_IDENTIFIER');
    referenceIds.push(id);
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      action: input.action,
      outcome: input.outcome,
      correlationId,
      referenceIds: Object.freeze(referenceIds),
      tenantScope,
    }),
  });
}

export function createDdaRetentionConstraintV1(input: {
  readonly artifactVersionId: unknown;
  readonly tenantScope: unknown;
  readonly holdReason: unknown;
  readonly requestedBy: unknown;
  readonly deleteDirectly?: unknown;
}): DdaPolicyResultV1<DdaRetentionConstraintV1> {
  if (input.deleteDirectly === true) return rejected('RETENTION_OWNERSHIP');
  const artifactVersionId = identifier(input.artifactVersionId);
  const requestedBy = identifier(input.requestedBy);
  const tenantScope = scope(input.tenantScope);
  if (!artifactVersionId || !requestedBy) return rejected('INVALID_IDENTIFIER');
  if (!tenantScope) return rejected('INVALID_SCOPE');
  if (typeof input.holdReason !== 'string' || input.holdReason.length === 0) {
    return rejected('INVALID_POLICY');
  }
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      artifactVersionId,
      tenantScope,
      holdReason: input.holdReason.normalize('NFC').trim(),
      requestedBy,
    }),
  });
}

export function deterministicCapabilitiesWhenAiUnavailableV1(): readonly string[] {
  return Object.freeze(['DETERMINISTIC_ETL', 'MANUAL_TYPED_ANALYSIS', 'SAVED_SNAPSHOT_VIEW']);
}
