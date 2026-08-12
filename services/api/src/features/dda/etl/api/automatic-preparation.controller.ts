import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  AutomaticPreparationEnqueueService,
  type AutomaticPreparationEnqueueValueV1,
} from '../application/automatic-preparation-enqueue.service.js';
import type { AutomaticPreparationProfileV1 } from '../application/automatic-preparation-policy.js';
import { AutomaticPreparationProblemError } from '../application/automatic-preparation-problem.error.js';

export interface AutomaticPreparationEvaluateDtoV1 {
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
}

/** DDA-053: classify and optionally enqueue automatic safe preparation. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/automatic-preparation')
export class AutomaticPreparationController {
  public constructor(private readonly service: AutomaticPreparationEnqueueService) {}

  @Post('evaluate')
  public async evaluate(@Body() dto: AutomaticPreparationEvaluateDtoV1) {
    const result = await this.service.evaluateAndMaybeEnqueue(dto);
    if (!result.accepted) throw new AutomaticPreparationProblemError(result.code);
    return this.toResponse(result.value);
  }

  private toResponse(value: AutomaticPreparationEnqueueValueV1) {
    if (value.kind === 'ENQUEUED') {
      return Object.freeze({
        accepted: true as const,
        kind: value.kind,
        decision: value.classification.decision,
        reasonCodes: value.classification.reasonCodes,
        datasetVersionId: value.acceptance.datasetVersionId,
        jobId: value.acceptance.jobId,
        summary: Object.freeze({
          summaryId: value.summary.summaryId,
          datasetVersionId: value.summary.datasetVersionId,
          automaticPolicy: value.summary.automaticPolicy,
          counts: value.summary.counts,
          transformations: value.summary.transformations,
          warnings: value.summary.warnings,
          exclusions: value.summary.exclusions,
          healthDimensions: value.summary.healthDimensions,
        }),
      });
    }
    if (value.kind === 'ETL_REVIEW') {
      return Object.freeze({
        accepted: true as const,
        kind: value.kind,
        decision: value.classification.decision,
        reasonCodes: value.classification.reasonCodes,
        proposalId: value.proposalId,
      });
    }
    return Object.freeze({
      accepted: true as const,
      kind: value.kind,
      decision: value.classification.decision,
      reasonCodes: value.reasonCodes,
      proposalId: value.proposalId,
    });
  }
}
