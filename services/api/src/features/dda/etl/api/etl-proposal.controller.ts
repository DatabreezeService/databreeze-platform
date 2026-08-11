import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { EtlReviewContextV1 } from '../application/etl-proposal-repository.port.js';
import { EtlProposalProblemError } from '../application/etl-proposal-problem.error.js';
import { EtlProposalServiceV1 } from '../application/etl-proposal.service.js';
import type { EtlProposeDtoV1 } from './etl-proposal.dto.js';

interface EtlPlanAcceptanceSourceV1 {
  readonly contentHash?: unknown;
  readonly schemaHash?: unknown;
  readonly inputArtifactVersionId?: unknown;
  readonly transformations?: unknown[];
}

/** DDA-007: lineage parents are exact plan inputs, never invented IDs. */
export function lineageIdsFromEtlPlan(plan: EtlPlanAcceptanceSourceV1): readonly string[] | undefined {
  if (typeof plan.inputArtifactVersionId !== 'string' || plan.inputArtifactVersionId.length === 0) {
    return undefined;
  }
  const ordered: string[] = [plan.inputArtifactVersionId];
  const seen = new Set<string>(ordered);
  if (!Array.isArray(plan.transformations)) return Object.freeze(ordered);
  for (const step of plan.transformations) {
    if (!step || typeof step !== 'object') return undefined;
    const inputs = (step as { readonly inputs?: unknown }).inputs;
    if (!Array.isArray(inputs)) return undefined;
    for (const input of inputs) {
      if (typeof input !== 'string' || input.length === 0) return undefined;
      if (seen.has(input)) continue;
      seen.add(input);
      ordered.push(input);
    }
  }
  return Object.freeze(ordered);
}

/**
 * DDA-004/007: expose accept hashes only when the proposal is ready and plan hashes exist.
 * rowCount is accepted rows (changed + unchanged), not invented KPIs.
 */
export function acceptanceEvidenceFromProposal(input: {
  readonly state: string;
  readonly revision: number;
  readonly plan: EtlPlanAcceptanceSourceV1;
  readonly review: {
    readonly counts: { readonly changed: number; readonly unchanged: number; readonly rejected: number };
  };
}):
  | {
      readonly revision: number;
      readonly rowCount: number;
      readonly rejectedCount: number;
      readonly contentHash: string;
      readonly schemaHash: string;
      readonly lineageIds: readonly string[];
    }
  | undefined {
  if (input.state !== 'READY_FOR_ACCEPTANCE') return undefined;
  if (typeof input.plan.contentHash !== 'string' || typeof input.plan.schemaHash !== 'string') {
    return undefined;
  }
  const lineageIds = lineageIdsFromEtlPlan(input.plan);
  if (lineageIds === undefined) return undefined;
  return Object.freeze({
    revision: input.revision,
    rowCount: input.review.counts.changed + input.review.counts.unchanged,
    rejectedCount: input.review.counts.rejected,
    contentHash: input.plan.contentHash,
    schemaHash: input.plan.schemaHash,
    lineageIds,
  });
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/etl-proposals')
export class EtlProposalController {
  public constructor(private readonly service: EtlProposalServiceV1) {}

  @Post()
  public async propose(@Body() dto: EtlProposeDtoV1) {
    const result = await this.service.propose({
      planInput: dto.planInput,
      reviewContext: dto.reviewContext as unknown as EtlReviewContextV1,
    });
    if (!result.accepted) throw new EtlProposalProblemError(result.code);
    return {
      accepted: true,
      proposalId: result.value.proposalId,
      revision: result.value.revision,
      state: result.value.state,
      blockingReasons: result.value.blockingReasons,
      evidenceStatus: result.value.review.evidenceStatus,
      estimatedCost: result.value.review.estimatedCost,
      counts: result.value.review.counts,
    };
  }

  @Get(':proposalId')
  public async get(@Param('proposalId') proposalId: string) {
    const result = await this.service.getProposal(proposalId);
    if (!result.accepted) throw new EtlProposalProblemError(result.code);
    const plan = result.value.plan as EtlPlanAcceptanceSourceV1;
    const acceptanceEvidence = acceptanceEvidenceFromProposal({
      state: result.value.state,
      revision: result.value.revision,
      plan,
      review: result.value.review,
    });
    return {
      accepted: true,
      proposalId: result.value.proposalId,
      revision: result.value.revision,
      state: result.value.state,
      blockingReasons: result.value.blockingReasons,
      sourceSchema: result.value.review.sourceSchema,
      inferredSchema: result.value.review.inferredSchema,
      targetSchema: result.value.review.targetSchema,
      assumptions: result.value.review.assumptions,
      counts: result.value.review.counts,
      exclusions: result.value.review.exclusions,
      unsupportedScopes: result.value.review.unsupportedScopes,
      qualityEffects: result.value.review.qualityEffects,
      evidenceStatus: result.value.review.evidenceStatus,
      estimatedCost: result.value.review.estimatedCost,
      orderedSteps: plan.transformations ?? [],
      ...(acceptanceEvidence === undefined ? {} : { acceptanceEvidence }),
    };
  }
}
