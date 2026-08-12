import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import {
  AutomaticPreparationService,
  type AutomaticPreparationRouteV1,
} from './automatic-preparation.service.js';
import type {
  AutomaticPreparationPlanV1,
  AutomaticPreparationProfileV1,
} from './automatic-preparation-policy.js';
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

const SAFE_KINDS = new Set([
  'RENAME_COLUMNS',
  'TRIM_TEXT',
  'NORMALIZE_TEXT',
  'CAST_TYPE',
  'SELECT_COLUMNS',
]);

function rejected(
  code: AutomaticPreparationEnqueueProblemCodeV1,
): AutomaticPreparationEnqueueResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

/** Map an immutable ETL plan into the automatic-preparation step view. */
export function planFromEtlProposal(plan: DdaEtlPlanV1): AutomaticPreparationPlanV1 {
  return Object.freeze({
    steps: Object.freeze(
      plan.transformations.map((step) =>
        Object.freeze({
          kind: step.kind,
          reversible: SAFE_KINDS.has(step.kind),
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
  public constructor(
    private readonly preparation: AutomaticPreparationService,
    private readonly proposals: EtlProposalRepositoryPortV1,
    private readonly acceptance: EtlAcceptanceServiceV1,
  ) {}

  public async evaluateAndMaybeEnqueue(input: {
    readonly tenantScope: TenantScopeV1;
    readonly proposalId: string;
    readonly profile: AutomaticPreparationProfileV1;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly expected: {
      readonly rowCount: number;
      readonly rejectedCount: number;
      readonly contentHash: string;
      readonly schemaHash: string;
      readonly lineageIds: readonly string[];
    };
  }): Promise<AutomaticPreparationEnqueueResultV1<AutomaticPreparationEnqueueValueV1>> {
    const proposal = await this.proposals.findById(input.proposalId);
    if (!proposal) return rejected('DDA_ETL_NOT_FOUND');

    const plan = planFromEtlProposal(proposal.plan as DdaEtlPlanV1);
    const route = this.preparation.classifyAndRoute(plan, input.profile);

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

    const accepted = await this.acceptance.accept({
      tenantScope: input.tenantScope,
      proposalId: input.proposalId,
      expectedRevision: proposal.revision,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      expected: input.expected,
    });
    if (!accepted.accepted) {
      await this.markBlocked(proposal, [
        'EXECUTION_DIVERGED_FROM_PREVIEW',
        accepted.code,
      ]);
      return rejected(accepted.code);
    }

    const summaryResult = buildPreparationSummary({
      summaryId: input.correlationId,
      datasetVersionId: accepted.value.datasetVersionId,
      automaticPolicy: input.profile.policy,
      counts: input.profile.accounting,
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
        input.profile.accounting.input,
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
    const merged = Object.freeze([
      ...new Set([...proposal.blockingReasons, ...reasonCodes]),
    ]);
    await this.proposals.update({
      ...proposal,
      state: 'NEEDS_REVIEW',
      blockingReasons: merged,
      revision: proposal.revision + 1,
    });
  }
}
