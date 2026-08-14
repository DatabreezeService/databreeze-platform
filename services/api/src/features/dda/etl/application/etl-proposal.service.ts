import { randomUUID } from 'node:crypto';

import { createDdaEtlPlanV1, type DdaEtlPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
  EtlReviewContextV1,
} from './etl-proposal-repository.port.js';

export type EtlProposalProblemCodeV1 =
  | 'DDA_ETL_ARBITRARY_CODE'
  | 'DDA_ETL_CYCLE'
  | 'DDA_ETL_MISSING_VERSION_BINDING'
  | 'DDA_ETL_UNSTABLE_ORDER'
  | 'DDA_ETL_INCOMPLETE_GATE'
  | 'DDA_ETL_UNDISCLOSED_SAMPLING'
  | 'DDA_ETL_INVALID_PLAN'
  | 'DDA_ETL_AUTHORIZATION_DENIED'
  | 'DDA_ETL_AUTHORIZATION_UNAVAILABLE'
  | 'DDA_ETL_NOT_FOUND'
  | 'UNSUPPORTED_TRANSFORM';

export type EtlProposalResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: EtlProposalProblemCodeV1 };

const ALLOWED_KINDS = new Set([
  'SELECT_COLUMNS',
  'RENAME_COLUMNS',
  'TRIM_TEXT',
  'NORMALIZE_TEXT',
  'PARSE_DATE',
  'PARSE_TIME',
  'PARSE_NUMBER',
  'PARSE_CURRENCY',
  'CAST_TYPE',
  'REPLACE_NULL',
  'FILTER_ROWS',
  'DEDUPLICATE',
  'DERIVE_FIELD',
  'UNION_COMPATIBLE',
  'LOOKUP_JOIN',
  'AGGREGATE',
]);

const KIND_ORDER: Record<string, number> = {
  SELECT_COLUMNS: 10,
  RENAME_COLUMNS: 20,
  TRIM_TEXT: 30,
  NORMALIZE_TEXT: 40,
  PARSE_DATE: 50,
  PARSE_TIME: 50,
  PARSE_NUMBER: 50,
  PARSE_CURRENCY: 50,
  CAST_TYPE: 60,
  REPLACE_NULL: 70,
  FILTER_ROWS: 80,
  DEDUPLICATE: 90,
  DERIVE_FIELD: 100,
  UNION_COMPATIBLE: 110,
  LOOKUP_JOIN: 120,
  AGGREGATE: 130,
};

function rejected(code: EtlProposalProblemCodeV1): EtlProposalResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function detectCycle(
  transformations: readonly { readonly stepId: string; readonly inputs: readonly string[] }[],
) {
  const ids = new Set(transformations.map((step) => step.stepId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(transformations.map((step) => [step.stepId, step]));
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const step = byId.get(id);
    for (const input of step?.inputs ?? []) {
      if (ids.has(input) && visit(input)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...ids].some((id) => visit(id));
}

/** DDA-005/006/008/009/010/011: propose visible allowlisted ETL for review. */
export class EtlProposalServiceV1 {
  public constructor(private readonly repository: EtlProposalRepositoryPortV1) {}

  public async propose(input: {
    readonly planInput: Record<string, unknown>;
    readonly reviewContext: EtlReviewContextV1;
  }): Promise<EtlProposalResultV1<EtlProposalRecordV1>> {
    const transformations = input.planInput['transformations'];
    if (!Array.isArray(transformations)) return rejected('DDA_ETL_INVALID_PLAN');
    for (const step of transformations) {
      if (!step || typeof step !== 'object') return rejected('DDA_ETL_INVALID_PLAN');
      const kind = (step as { kind?: unknown }).kind;
      if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
        return rejected('DDA_ETL_ARBITRARY_CODE');
      }
      const config = (step as { config?: Record<string, unknown> }).config;
      if (config && ('code' in config || 'expression' in config || 'sql' in config)) {
        return rejected('DDA_ETL_ARBITRARY_CODE');
      }
    }

    const requiredBindings = [
      'inputArtifactVersionId',
      'schemaVersionId',
      'mappingVersionId',
      'ruleSetVersionId',
      'engineBindingId',
    ] as const;
    for (const key of requiredBindings) {
      if (input.planInput[key] === undefined || input.planInput[key] === null) {
        return rejected('DDA_ETL_MISSING_VERSION_BINDING');
      }
    }

    const normalizedSteps = transformations.map((step) => {
      const record = step as {
        stepId: string;
        kind: string;
        inputs: string[];
        config?: Record<string, unknown>;
        configEntries?: Array<{ key: string; value: string }>;
      };
      const config =
        record.config ??
        Object.fromEntries((record.configEntries ?? []).map((entry) => [entry.key, entry.value]));
      return { stepId: record.stepId, kind: record.kind, inputs: record.inputs, config };
    });

    if (detectCycle(normalizedSteps)) return rejected('DDA_ETL_CYCLE');

    for (let index = 1; index < normalizedSteps.length; index += 1) {
      const previous = KIND_ORDER[normalizedSteps[index - 1]?.kind ?? ''] ?? 0;
      const current = KIND_ORDER[normalizedSteps[index]?.kind ?? ''] ?? 0;
      if (current < previous) return rejected('DDA_ETL_UNSTABLE_ORDER');
    }

    if (!input.reviewContext.sampling.disclosed) {
      return rejected('DDA_ETL_UNDISCLOSED_SAMPLING');
    }

    const hasRejectOrUnsupported =
      input.reviewContext.counts.rejected > 0 ||
      input.reviewContext.exclusions.some((item) => item.count > 0) ||
      input.reviewContext.unsupportedScopes.some((item) => item.count > 0);
    if (
      hasRejectOrUnsupported &&
      input.reviewContext.qualityEffects.some((effect) => effect.completeGateEligible)
    ) {
      return rejected('DDA_ETL_INCOMPLETE_GATE');
    }

    const plan = createDdaEtlPlanV1({
      planId: input.planInput['planId'],
      planVersionId: input.planInput['planVersionId'],
      tenantScope: input.planInput['tenantScope'],
      inputArtifactVersionId: input.planInput['inputArtifactVersionId'],
      schemaVersionId: input.planInput['schemaVersionId'],
      mappingVersionId: input.planInput['mappingVersionId'],
      ruleSetVersionId: input.planInput['ruleSetVersionId'],
      engineBindingId: input.planInput['engineBindingId'],
      transformations: normalizedSteps,
      contentHash: input.planInput['contentHash'],
      schemaHash: input.planInput['schemaHash'],
      dataClassification: input.planInput['dataClassification'],
      dataModePolicyVersionId: input.planInput['dataModePolicyVersionId'],
      retentionReferenceId: input.planInput['retentionReferenceId'],
      evidenceReferenceId: input.planInput['evidenceReferenceId'],
      createdAt: input.planInput['createdAt'],
      ...(input.planInput['inputTenantScope'] === undefined
        ? {}
        : { inputTenantScope: input.planInput['inputTenantScope'] }),
    });
    if (!plan.accepted) {
      if (plan.code === 'UNSUPPORTED_TRANSFORM') return rejected('DDA_ETL_ARBITRARY_CODE');
      return rejected('DDA_ETL_INVALID_PLAN');
    }

    const blockingReasons = [...(input.reviewContext.driftSignals ?? [])];
    const state = blockingReasons.length > 0 ? 'NEEDS_REVIEW' : 'READY_FOR_ACCEPTANCE';
    const review: EtlReviewContextV1 = {
      ...input.reviewContext,
      aiSuggestions: Object.freeze(
        input.reviewContext.aiSuggestions.map((suggestion) =>
          Object.freeze({ ...suggestion, authoritative: false as const }),
        ),
      ),
      ...(input.reviewContext.overallQualitySummary
        ? {
            overallQualitySummary: Object.freeze({
              ...input.reviewContext.overallQualitySummary,
              provesFactualCorrectness: false as const,
            }),
          }
        : {}),
    };
    const record: EtlProposalRecordV1 = Object.freeze({
      proposalId: randomUUID(),
      revision: 1,
      state,
      blockingReasons: Object.freeze(blockingReasons),
      plan: plan.value,
      review: Object.freeze(review),
      createdAt: new Date().toISOString(),
    });
    return Object.freeze({ accepted: true, value: await this.repository.save(record) });
  }

  public async getProposal(proposalId: string): Promise<EtlProposalResultV1<EtlProposalRecordV1>> {
    const found = await this.repository.findById(proposalId);
    if (!found) return rejected('DDA_ETL_NOT_FOUND');
    return Object.freeze({ accepted: true, value: found });
  }

  public asPlan(record: EtlProposalRecordV1): DdaEtlPlanV1 {
    return record.plan as DdaEtlPlanV1;
  }
}
