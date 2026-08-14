import {
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

import {
  AutomaticPreparationService,
  type AutomaticPreparationRouteV1,
} from './automatic-preparation.service.js';
import type { AutomaticPreparationPlanV1 } from './automatic-preparation-policy.js';
import {
  type AutomaticPreparationDatasetAuthorityPortV1,
  type AutomaticPreparationDatasetAuthorityValueV1,
  type AutomaticPreparationPolicyAuthorityPortV1,
  type AutomaticPreparationProfileAuthorityPortV1,
  type AutomaticPreparationProfileAuthorityValueV1,
  UnavailableAutomaticPreparationDatasetAuthorityAdapter,
  UnavailableAutomaticPreparationPolicyAuthorityAdapter,
  UnavailableAutomaticPreparationProfileAuthorityAdapter,
} from './automatic-preparation-authority.port.js';
import {
  EtlAcceptanceServiceV1,
  type EtlAcceptanceProblemCodeV1,
  type EtlAcceptanceValueV1,
} from './etl-acceptance.service.js';
import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
  EtlQualityEffectV1,
} from './etl-proposal-repository.port.js';
import {
  buildPreparationSummary,
  type PreparationSummaryV1,
} from './preparation-summary.service.js';

export type AutomaticPreparationEnqueueProblemCodeV1 =
  | 'DDA_ETL_NOT_FOUND'
  | 'DDA_ETL_REVISION_CONFLICT'
  | 'DDA_ETL_POLICY_UNAVAILABLE'
  | 'DDA_ETL_PROFILE_UNAVAILABLE'
  | 'DDA_ETL_PROFILE_INVALID'
  | 'DDA_ETL_DATASET_UNAVAILABLE'
  | 'DDA_ETL_SCOPE_MISMATCH'
  | 'DDA_ETL_UNAUTHORIZED'
  | EtlAcceptanceProblemCodeV1
  | 'DDA_PREPARATION_SUMMARY_INVALID';

export type AutomaticPreparationEnqueueResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AutomaticPreparationEnqueueProblemCodeV1 };

export type AutomaticPreparationEnqueueValueV1 =
  | {
      readonly kind: 'ENQUEUED';
      readonly classification: AutomaticPreparationRouteV1['classification'];
      readonly acceptance: EtlAcceptanceValueV1;
      readonly summary: PreparationSummaryV1;
    }
  | {
      readonly kind: 'ETL_REVIEW';
      readonly classification: AutomaticPreparationRouteV1['classification'];
      readonly proposalId: string;
    }
  | {
      readonly kind: 'BLOCKED_REVIEW_ITEM';
      readonly classification: AutomaticPreparationRouteV1['classification'];
      readonly proposalId: string;
      readonly reasonCodes: readonly string[];
    };

function rejected(
  code: AutomaticPreparationEnqueueProblemCodeV1,
): AutomaticPreparationEnqueueResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopesEqualV1(left, right);
}

function sameIdentifiers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function profileEvidenceMatchesAuthorities(
  profile: AutomaticPreparationProfileAuthorityValueV1,
  dataset: AutomaticPreparationDatasetAuthorityValueV1,
): boolean {
  const accounting = profile.profile.accounting;
  const rejected = accounting.rejected + accounting.quarantined + accounting.unsupported;
  return (
    profile.expected.rowCount === accounting.output &&
    profile.expected.rejectedCount === rejected &&
    profile.expected.contentHash === dataset.contentHash &&
    profile.expected.schemaHash === dataset.schemaHash &&
    sameIdentifiers(profile.expected.lineageIds, dataset.lineageIds)
  );
}

/** Map an immutable ETL plan into the automatic-preparation step view. */
export function planFromEtlProposal(
  plan: DdaEtlPlanV1,
  sourceColumns: readonly string[],
): AutomaticPreparationPlanV1 {
  return Object.freeze({
    sourceColumns: Object.freeze([...sourceColumns]),
    steps: Object.freeze(
      plan.transformations.map((step) =>
        Object.freeze({
          stepId: step.stepId,
          kind: step.kind,
          config: Object.freeze({ ...step.config }),
          reversible: false,
          omitsRows: step.kind === 'FILTER_ROWS' || step.kind === 'DEDUPLICATE',
        }),
      ),
    ),
  });
}

function defaultHealthDimensions(
  effects: readonly EtlQualityEffectV1[],
  inputCount: number,
): PreparationSummaryV1['healthDimensions'] {
  const names = [
    'completeness',
    'validity',
    'uniqueness',
    'consistency',
    'freshness',
    'extractionConfidence',
  ] as const;
  return Object.freeze(
    names.map((name) => {
      const effect = effects.find(
        (item) =>
          item.dimension === name ||
          (name === 'extractionConfidence' && item.dimension === 'extraction_confidence'),
      );
      if (effect) {
        return Object.freeze({
          name,
          numerator: effect.coverage,
          denominator: effect.denominator,
          coverage: effect.denominator === 0 ? 0 : effect.coverage / effect.denominator,
          rule: effect.rule,
          sampleStatus:
            effect.sampleState === 'FULL'
              ? ('PASS' as const)
              : effect.sampleState === 'NONE'
                ? ('UNKNOWN' as const)
                : ('FAIL' as const),
          limitation: effect.limitations[0] ?? 'Derived from accepted version only',
        });
      }
      return Object.freeze({
        name,
        numerator: 0,
        denominator: inputCount,
        coverage: 0,
        rule: 'not-evaluated',
        sampleStatus: 'UNKNOWN' as const,
        limitation: 'Dimension not evaluated for this preparation',
      });
    }),
  );
}

/** DDA-053: classify then enqueue accepted JRA only for AUTO_ACCEPT_SAFE. */
export class AutomaticPreparationEnqueueService {
  private readonly profileAuthority: AutomaticPreparationProfileAuthorityPortV1;
  private readonly policyAuthority: AutomaticPreparationPolicyAuthorityPortV1;
  private readonly datasetAuthority: AutomaticPreparationDatasetAuthorityPortV1;

  public constructor(
    private readonly preparation: AutomaticPreparationService,
    private readonly proposals: EtlProposalRepositoryPortV1,
    private readonly acceptance: EtlAcceptanceServiceV1,
    authorities: {
      readonly profile?: AutomaticPreparationProfileAuthorityPortV1;
      readonly policy?: AutomaticPreparationPolicyAuthorityPortV1;
      readonly dataset?: AutomaticPreparationDatasetAuthorityPortV1;
    } = {},
  ) {
    this.profileAuthority =
      authorities.profile ?? new UnavailableAutomaticPreparationProfileAuthorityAdapter();
    this.policyAuthority =
      authorities.policy ?? new UnavailableAutomaticPreparationPolicyAuthorityAdapter();
    this.datasetAuthority =
      authorities.dataset ?? new UnavailableAutomaticPreparationDatasetAuthorityAdapter();
  }

  public async evaluateAndMaybeEnqueue(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly idempotencyKey: string;
    readonly expectedRevision: number;
    readonly correlationId: StableIdentifierV1;
  }): Promise<AutomaticPreparationEnqueueResultV1<AutomaticPreparationEnqueueValueV1>> {
    const proposal = await this.proposals.findById(input.proposalId, input.tenantScope);
    if (!proposal) return rejected('DDA_ETL_NOT_FOUND');
    if (proposal.revision !== input.expectedRevision) return rejected('DDA_ETL_REVISION_CONFLICT');

    const planRecord = proposal.plan as Partial<DdaEtlPlanV1>;
    if (
      typeof planRecord.planVersionId !== 'string' ||
      typeof planRecord.inputArtifactVersionId !== 'string'
    ) {
      return rejected('DDA_ETL_PROFILE_INVALID');
    }

    const dataset = await this.resolveDataset({
      tenantScope: input.tenantScope,
      proposalId: input.proposalId,
      proposalRevision: proposal.revision,
      inputArtifactVersionId: planRecord.inputArtifactVersionId,
    });
    if (!dataset.accepted) return rejected(dataset.code);

    const profile = await this.resolveProfile({
      tenantScope: input.tenantScope,
      actorId: input.actorId,
      proposalId: input.proposalId,
      proposalRevision: proposal.revision,
      planVersionId: planRecord.planVersionId,
      inputArtifactVersionId: planRecord.inputArtifactVersionId,
    });
    if (!profile.accepted) return rejected(profile.code);

    const policy = await this.resolvePolicy({
      tenantScope: input.tenantScope,
      actorId: input.actorId,
      proposalId: input.proposalId,
      proposalRevision: proposal.revision,
      inputArtifactVersionId: planRecord.inputArtifactVersionId,
      policyVersionId:
        typeof planRecord.dataModePolicyVersionId === 'string'
          ? planRecord.dataModePolicyVersionId
          : '',
    });
    if (!policy.accepted) return rejected(policy.code);
    if (!sameScope(policy.value.tenantScope, input.tenantScope)) {
      return rejected('DDA_ETL_SCOPE_MISMATCH');
    }
    if (!policy.value.authorized) return rejected('DDA_ETL_UNAUTHORIZED');
    if (
      policy.value.policyVersionId !== planRecord.dataModePolicyVersionId ||
      profile.value.planVersionId !== planRecord.planVersionId ||
      profile.value.inputArtifactVersionId !== planRecord.inputArtifactVersionId ||
      profile.value.proposalRevision !== proposal.revision ||
      profile.value.proposalId !== input.proposalId ||
      !profile.value.engineProduced ||
      !profile.value.immutable ||
      !sameScope(profile.value.tenantScope, input.tenantScope) ||
      dataset.value.inputArtifactVersionId !== planRecord.inputArtifactVersionId ||
      !dataset.value.immutableOriginal ||
      !sameScope(dataset.value.tenantScope, input.tenantScope) ||
      !profileEvidenceMatchesAuthorities(profile.value, dataset.value)
    ) {
      return rejected('DDA_ETL_PROFILE_INVALID');
    }

    const plan = planFromEtlProposal(proposal.plan as DdaEtlPlanV1, dataset.value.sourceColumns);
    const route = this.preparation.classifyAndRoute(
      plan,
      profile.value.profile,
      policy.value.automaticPolicy,
    );

    if (route.kind === 'ETL_REVIEW') {
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          kind: 'ETL_REVIEW' as const,
          classification: route.classification,
          proposalId: proposal.proposalId,
        }),
      });
    }

    if (route.kind === 'BLOCKED_REVIEW_ITEM') {
      await this.markBlocked(proposal, route.classification.reasonCodes);
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          kind: 'BLOCKED_REVIEW_ITEM' as const,
          classification: route.classification,
          proposalId: proposal.proposalId,
          reasonCodes: route.classification.reasonCodes,
        }),
      });
    }

    const finalProposal = await this.proposals.findById(input.proposalId, input.tenantScope);
    if (!finalProposal) return rejected('DDA_ETL_NOT_FOUND');
    if (finalProposal.revision !== input.expectedRevision) {
      return rejected('DDA_ETL_REVISION_CONFLICT');
    }
    const finalPolicy = await this.recheckPolicy({
      tenantScope: input.tenantScope,
      actorId: input.actorId,
      proposalId: input.proposalId,
      proposalRevision: finalProposal.revision,
      inputArtifactVersionId: planRecord.inputArtifactVersionId,
      policyVersionId: policy.value.policyVersionId,
      authorizationEpoch: policy.value.authorizationEpoch,
    });
    if (!finalPolicy.accepted) return rejected(finalPolicy.code);
    if (
      !finalPolicy.value.authorized ||
      !sameScope(finalPolicy.value.tenantScope, input.tenantScope) ||
      finalPolicy.value.policyVersionId !== planRecord.dataModePolicyVersionId ||
      finalPolicy.value.automaticPolicy !== 'SAFE_NON_LOSSY'
    ) {
      return rejected('DDA_ETL_POLICY_CHANGED');
    }

    const accepted = await this.acceptance.accept({
      tenantScope: input.tenantScope,
      context: this.acceptanceContext(
        input,
        finalProposal.revision,
        finalPolicy.value.authorizationEpoch,
      ),
      proposalId: input.proposalId,
      expectedRevision: finalProposal.revision,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      expected: profile.value.expected,
    });
    if (!accepted.accepted) {
      await this.markBlocked(proposal, ['EXECUTION_DIVERGED_FROM_PREVIEW', accepted.code]);
      return rejected(accepted.code);
    }

    const summaryResult = buildPreparationSummary({
      summaryId: input.correlationId,
      datasetVersionId: accepted.value.datasetVersionId,
      automaticPolicy: policy.value.automaticPolicy,
      counts: profile.value.profile.accounting,
      transformations: plan.steps.map((step) => step.kind),
      warnings: [],
      exclusions: proposal.review.exclusions.map((item) =>
        Object.freeze({
          scope: item.scope,
          reasonCode: item.reasonCode,
          count: item.count,
        }),
      ),
      healthDimensions: defaultHealthDimensions(
        proposal.review.qualityEffects,
        profile.value.profile.accounting.input,
      ),
    });
    if (!summaryResult.accepted) {
      return rejected('DDA_PREPARATION_SUMMARY_INVALID');
    }

    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        kind: 'ENQUEUED' as const,
        classification: route.classification,
        acceptance: accepted.value,
        summary: summaryResult.value,
      }),
    });
  }

  private async markBlocked(
    proposal: EtlProposalRecordV1,
    reasonCodes: readonly string[],
  ): Promise<void> {
    const merged = Object.freeze([...new Set([...proposal.blockingReasons, ...reasonCodes])]);
    await this.proposals.update({
      ...proposal,
      state: 'NEEDS_REVIEW',
      blockingReasons: merged,
      revision: proposal.revision + 1,
    });
  }

  private acceptanceContext(
    input: {
      readonly tenantScope: TenantScopeV1;
      readonly actorId: StableIdentifierV1;
      readonly idempotencyKey: string;
      readonly correlationId: StableIdentifierV1;
    },
    expectedRevision: number,
    authorizationEpoch: number,
  ): IamTenantContextV1 {
    return Object.freeze({
      tenantScope: input.tenantScope,
      actorId: input.actorId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      authorizationEpoch,
      mfaReenrollmentRequired: false,
      expectedRevision,
    });
  }

  private async resolveDataset(input: {
    readonly tenantScope: TenantScopeV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
  }) {
    try {
      return await this.datasetAuthority.resolve(input);
    } catch {
      return rejected('DDA_ETL_DATASET_UNAVAILABLE');
    }
  }

  private async resolveProfile(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly planVersionId: string;
    readonly inputArtifactVersionId: string;
  }) {
    try {
      return await this.profileAuthority.resolve(input);
    } catch {
      return rejected('DDA_ETL_PROFILE_UNAVAILABLE');
    }
  }

  private async resolvePolicy(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
    readonly policyVersionId: string;
  }) {
    try {
      return await this.policyAuthority.resolve(input);
    } catch {
      return rejected('DDA_ETL_POLICY_UNAVAILABLE');
    }
  }

  private async recheckPolicy(input: {
    readonly tenantScope: TenantScopeV1;
    readonly actorId: StableIdentifierV1;
    readonly proposalId: string;
    readonly proposalRevision: number;
    readonly inputArtifactVersionId: string;
    readonly policyVersionId: string;
    readonly authorizationEpoch: number;
  }) {
    try {
      return await this.policyAuthority.recheck(input);
    } catch {
      return rejected('DDA_ETL_POLICY_UNAVAILABLE');
    }
  }
}
