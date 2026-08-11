import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { EtlReviewContextV1 } from '../application/etl-proposal-repository.port.js';
import { EtlProposalProblemError } from '../application/etl-proposal-problem.error.js';
import { EtlProposalServiceV1 } from '../application/etl-proposal.service.js';
import type { EtlProposeDtoV1 } from './etl-proposal.dto.js';

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
    const plan = result.value.plan as {
      readonly contentHash?: unknown;
      readonly schemaHash?: unknown;
      readonly lineageIds?: unknown;
      readonly transformations?: unknown[];
    };
    const acceptanceEvidence =
      typeof plan.contentHash === 'string' &&
      typeof plan.schemaHash === 'string' &&
      Array.isArray(plan.lineageIds) &&
      plan.lineageIds.every((entry) => typeof entry === 'string')
        ? {
            revision: result.value.revision,
            rowCount: result.value.review.sampling.rowCount,
            rejectedCount: result.value.review.counts.rejected,
            contentHash: plan.contentHash,
            schemaHash: plan.schemaHash,
            lineageIds: plan.lineageIds,
          }
        : undefined;
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