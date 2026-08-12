export type AutomaticPreparationDecisionV1 =
  | 'AUTO_ACCEPT_SAFE'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export type AutomaticPreparationPolicyV1 = 'SAFE_NON_LOSSY' | 'NONE';

export interface AutomaticPreparationStepV1 {
  readonly kind: string;
  readonly reversible: boolean;
  readonly omitsRows: boolean;
}

export interface AutomaticPreparationPlanV1 {
  readonly steps: readonly AutomaticPreparationStepV1[];
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

function accountingComplete(counts: AutomaticPreparationAccountingV1): boolean {
  return (
    counts.unchanged +
      counts.changed +
      counts.rejected +
      counts.quarantined +
      counts.unsupported ===
    counts.input
  );
}

/** DDA-053: classify an immutable ETL plan before any automatic acceptance. */
export function classifyAutomaticPreparation(
  plan: AutomaticPreparationPlanV1,
  profile: AutomaticPreparationProfileV1,
): AutomaticPreparationClassificationV1 {
  const reasonCodes: string[] = [];
  if (profile.policy !== 'SAFE_NON_LOSSY') reasonCodes.push('POLICY_DISABLED');
  if (!accountingComplete(profile.accounting)) reasonCodes.push('INCOMPLETE_ACCOUNTING');
  if (profile.omittedRows > 0) reasonCodes.push('OMITTED_ROWS');
  if (profile.unaccountedRejects > 0) reasonCodes.push('UNACCOUNTED_REJECTS');
  if (profile.sourceOverlap) reasonCodes.push('SOURCE_OVERLAP');
  if (profile.blockedQualityDimensions.length > 0) reasonCodes.push('QUALITY_BLOCKED');
  if (profile.externalEnrichment) reasonCodes.push('EXTERNAL_ENRICHMENT');
  for (const step of plan.steps) {
    if (step.omitsRows || !step.reversible || !SAFE_KINDS.has(step.kind)) {
      reasonCodes.push('UNSAFE_STEP');
      break;
    }
  }

  const blocked = new Set([
    'POLICY_DISABLED',
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
