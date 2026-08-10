import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { EtlAcceptanceProblemError } from '../application/etl-acceptance-problem.error.js';
import { EtlAcceptanceServiceV1 } from '../application/etl-acceptance.service.js';

export interface EtlAcceptDtoV1 {
  readonly tenantScope: unknown;
  readonly proposalId: string;
  readonly expectedRevision: number;
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

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/etl-acceptances')
export class EtlAcceptanceController {
  public constructor(private readonly service: EtlAcceptanceServiceV1) {}

  @Post()
  public async accept(@Body() dto: EtlAcceptDtoV1) {
    const tenantScope = parseTenantScopeV1(dto.tenantScope);
    if (!tenantScope.accepted) throw new EtlAcceptanceProblemError('DDA_ETL_NOT_FOUND');
    const result = await this.service.accept({
      tenantScope: tenantScope.value,
      proposalId: dto.proposalId,
      expectedRevision: dto.expectedRevision,
      idempotencyKey: dto.idempotencyKey,
      correlationId: dto.correlationId,
      expected: dto.expected,
    });
    if (!result.accepted) throw new EtlAcceptanceProblemError(result.code);
    return {
      accepted: true,
      proposalId: result.value.proposalId,
      jobId: result.value.jobId,
      artifactVersionId: result.value.artifactVersionId,
      datasetVersionId: result.value.datasetVersionId,
      rowCount: result.value.rowCount,
      contentHash: result.value.contentHash,
      schemaHash: result.value.schemaHash,
      lineageIds: result.value.lineageIds,
      replayed: result.value.replayed,
    };
  }
}
