export type AutomaticPreparationDecisionV1 = 'AUTO_ACCEPT_SAFE' | 'REVIEW_REQUIRED' | 'BLOCKED';

export type AutomaticPreparationPolicyV1 = 'SAFE_NON_LOSSY' | 'NONE';

export interface AutomaticPreparationStepV1 {
  readonly stepId: string;
  readonly kind: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly reversible: boolean;
  readonly omitsRows: boolean;
}

export interface AutomaticPreparationPlanV1 {
  readonly sourceColumns: readonly string[];
  readonly steps: readonly AutomaticPreparationStepV1[];
}

export interface AutomaticPreparationStepProofV1 {
  readonly stepId: string;
  readonly engineProduced: true;
  readonly verifiedConfig: Readonly<Record<string, unknown>>;
  readonly sourceColumns: readonly string[];
  readonly outputColumns: readonly string[];
  readonly lossless: true;
  readonly reversible: true;
  readonly exactAllColumnIdentity: boolean;
}

export interface AutomaticPreparationAccountingV1 {
  readonly input: number;
  readonly output: number;
  readonly unchanged: number;
  readonly changed: number;
  readonly rejected: number;
  readonly quarantined: number;
  readonly unsupported: number;
}

export interface AutomaticPreparationProfileV1 {
  readonly policy: AutomaticPreparationPolicyV1;
  readonly omittedRows: number;
  readonly ambiguousMappings: number;
  readonly incompatibleTypes: number;
  readonly unaccountedRejects: number;
  readonly sourceOverlap: boolean;
  readonly changedDuplicateKey: boolean;
  readonly currencyInference: boolean;
  readonly timezoneInference: boolean;
  readonly externalEnrichment: boolean;
  readonly blockedQualityDimensions: readonly string[];
  readonly sampledOnly: boolean;
  readonly sourceDrift: boolean;
  readonly accounting: AutomaticPreparationAccountingV1;
  readonly stepProofs: readonly AutomaticPreparationStepProofV1[];
}

export interface AutomaticPreparationExpectedV1 {
  readonly rowCount: number;
  readonly rejectedCount: number;
  readonly contentHash: string;
  readonly schemaHash: string;
  readonly lineageIds: readonly string[];
}

export interface AutomaticPreparationClassificationV1 {
  readonly decision: AutomaticPreparationDecisionV1;
  readonly reasonCodes: readonly string[];
}

const SAFE_KINDS = new Set([
  'RENAME_COLUMNS',
  'TRIM_TEXT',
  'NORMALIZE_TEXT',
  'CAST_TYPE',
  'SELECT_COLUMNS',
]);

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function accountingComplete(counts: AutomaticPreparationAccountingV1): boolean {
  const values: readonly number[] = [
    counts.input,
    counts.output,
    counts.unchanged,
    counts.changed,
    counts.rejected,
    counts.quarantined,
    counts.unsupported,
  ];
  return (
    counts.unchanged +
      counts.changed +
      counts.rejected +
      counts.quarantined +
      counts.unsupported ===
      counts.input &&
    counts.output === counts.unchanged + counts.changed &&
    values.every(nonNegativeInteger)
  );
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalValue(item)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalValue(left) === canonicalValue(right);
}

function configuredColumns(
  config: Readonly<Record<string, unknown>>,
): readonly string[] | undefined {
  const value = config['columns'];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Persisted config entries may use a compact comma-separated representation.
    }
    const columns = value
      .split(',')
      .map((column) => column.trim())
      .filter((column) => column.length > 0);
    return columns.length > 0 ? columns : undefined;
  }
  return undefined;
}

function sameColumns(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

function stepIsProvenSafe(
  plan: AutomaticPreparationPlanV1,
  step: AutomaticPreparationStepV1,
  profile: AutomaticPreparationProfileV1,
): boolean {
  if (!SAFE_KINDS.has(step.kind) || step.omitsRows || !step.config) return false;
  const proof = profile.stepProofs.find((candidate) => candidate.stepId === step.stepId);
  if (
    !proof ||
    proof.engineProduced !== true ||
    proof.lossless !== true ||
    proof.reversible !== true ||
    !sameValue(proof.verifiedConfig, step.config) ||
    !sameColumns(proof.sourceColumns, plan.sourceColumns)
  ) {
    return false;
  }
  if (step.kind === 'SELECT_COLUMNS') {
    const selected = configuredColumns(step.config);
    return (
      selected !== undefined &&
      sameColumns(selected, plan.sourceColumns) &&
      sameColumns(proof.outputColumns, plan.sourceColumns) &&
      proof.exactAllColumnIdentity
    );
  }
  if (step.kind === 'RENAME_COLUMNS') {
    return (
      proof.outputColumns.length === plan.sourceColumns.length &&
      new Set(proof.outputColumns).size === proof.outputColumns.length
    );
  }
  return proof.outputColumns.length === proof.sourceColumns.length;
}

/** DDA-053: classify an immutable ETL plan before any automatic acceptance. */
export function classifyAutomaticPreparation(
  plan: AutomaticPreparationPlanV1,
  profile: AutomaticPreparationProfileV1,
  approvedPolicy: AutomaticPreparationPolicyV1 = profile.policy,
): AutomaticPreparationClassificationV1 {
  const reasonCodes: string[] = [];
  if (approvedPolicy !== 'SAFE_NON_LOSSY') reasonCodes.push('POLICY_DISABLED');
  if (profile.policy !== approvedPolicy) reasonCodes.push('PROFILE_POLICY_MISMATCH');
  if (!accountingComplete(profile.accounting)) reasonCodes.push('INCOMPLETE_ACCOUNTING');
  if (!nonNegativeInteger(profile.omittedRows) || profile.omittedRows !== 0)
    reasonCodes.push('OMITTED_ROWS');
  if (!nonNegativeInteger(profile.unaccountedRejects) || profile.unaccountedRejects > 0)
    reasonCodes.push('UNACCOUNTED_REJECTS');
  if (profile.sourceOverlap) reasonCodes.push('SOURCE_OVERLAP');
  if (profile.blockedQualityDimensions.length > 0) reasonCodes.push('QUALITY_BLOCKED');
  if (profile.externalEnrichment) reasonCodes.push('EXTERNAL_ENRICHMENT');
  for (const step of plan.steps) {
    if (!stepIsProvenSafe(plan, step, profile)) {
      reasonCodes.push('UNSAFE_STEP');
      break;
    }
  }

  const blocked = new Set([
    'POLICY_DISABLED',
    'PROFILE_POLICY_MISMATCH',
    'INCOMPLETE_ACCOUNTING',
    'OMITTED_ROWS',
    'UNACCOUNTED_REJECTS',
    'SOURCE_OVERLAP',
    'QUALITY_BLOCKED',
    'EXTERNAL_ENRICHMENT',
    'UNSAFE_STEP',
  ]);
  if (reasonCodes.some((code) => blocked.has(code))) {
    return Object.freeze({
      decision: 'BLOCKED',
      reasonCodes: Object.freeze([...new Set(reasonCodes)]),
    });
  }

  if (profile.ambiguousMappings > 0) reasonCodes.push('AMBIGUOUS_MAPPING');
  if (profile.incompatibleTypes > 0) reasonCodes.push('INCOMPATIBLE_TYPE');
  if (profile.changedDuplicateKey) reasonCodes.push('CHANGED_DUPLICATE_KEY');
  if (profile.currencyInference) reasonCodes.push('CURRENCY_INFERENCE');
  if (profile.timezoneInference) reasonCodes.push('TIMEZONE_INFERENCE');
  if (profile.sampledOnly) reasonCodes.push('SAMPLED_PROFILE');
  if (profile.sourceDrift) reasonCodes.push('SOURCE_DRIFT');

  if (reasonCodes.length > 0) {
    return Object.freeze({
      decision: 'REVIEW_REQUIRED',
      reasonCodes: Object.freeze([...new Set(reasonCodes)]),
    });
  }

  return Object.freeze({
    decision: 'AUTO_ACCEPT_SAFE',
    reasonCodes: Object.freeze([]),
  });
}
