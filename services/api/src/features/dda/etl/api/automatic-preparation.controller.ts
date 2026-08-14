import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  AutomaticPreparationEnqueueService,
  type AutomaticPreparationEnqueueProblemCodeV1,
  type AutomaticPreparationEnqueueValueV1,
} from '../application/automatic-preparation-enqueue.service.js';
import {
  ETL_PROPOSAL_REPOSITORY_PORT,
  type EtlProposalRepositoryPortV1,
} from '../application/etl-proposal-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

export interface AutomaticPreparationEvaluateDtoV1 {
  readonly proposalId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
}

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'memberAuthorized',
  'actor',
  'actorId',
  'memberId',
  'organizationId',
  'orgId',
  'workspaceId',
  'projectId',
  'authorization',
  'authorized',
  'role',
  'profile',
  'expected',
  'policy',
  'accounting',
  'omittedRows',
  'ambiguousMappings',
  'ambiguity',
  'incompatibleTypes',
  'drift',
  'sourceDrift',
  'reversibility',
  'reversible',
  'lossless',
  'engineProduced',
  'immutable',
  'stepProofs',
]);
const SAFE_AUTOMATIC_PREPARATION_ERROR = Object.freeze({
  error: 'DDA_AUTOMATIC_PREPARATION_REJECTED',
});

function hasClientAuthorityField(value: unknown, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasClientAuthorityField(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthorityField(child, depth + 1),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 512 && !/\p{Cc}/u.test(value)
  );
}

function isStableIdentifier(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function automaticPreparationProblemStatus(
  code: AutomaticPreparationEnqueueProblemCodeV1,
): HttpStatus {
  if (code === 'DDA_ETL_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'DDA_ETL_UNAUTHORIZED') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_ETL_SCOPE_MISMATCH') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_ETL_PROFILE_INVALID') return HttpStatus.UNPROCESSABLE_ENTITY;
  if (
    code === 'DDA_ETL_PROFILE_UNAVAILABLE' ||
    code === 'DDA_ETL_POLICY_UNAVAILABLE' ||
    code === 'DDA_ETL_DATASET_UNAVAILABLE'
  )
    return HttpStatus.SERVICE_UNAVAILABLE;
  if (
    code === 'DDA_ETL_REVISION_CONFLICT' ||
    code === 'DDA_ETL_STALE_PROPOSAL' ||
    code === 'DDA_ETL_POLICY_CHANGED'
  )
    return HttpStatus.CONFLICT;
  if (code === 'DDA_ETL_BUA_DENIED') return HttpStatus.TOO_MANY_REQUESTS;
  if (
    code === 'DDA_PREPARATION_SUMMARY_INVALID' ||
    code === 'DDA_ETL_PARTIAL_OUTPUT' ||
    code === 'DDA_ETL_COUNT_MISMATCH' ||
    code === 'DDA_ETL_HASH_MISMATCH' ||
    code === 'DDA_ETL_SCHEMA_MISMATCH' ||
    code === 'DDA_ETL_MISSING_REJECT_BUNDLE' ||
    code === 'DDA_ETL_LINEAGE_MISMATCH'
  )
    return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwAutomaticPreparationProblem(code: AutomaticPreparationEnqueueProblemCodeV1): never {
  throw new HttpException(
    SAFE_AUTOMATIC_PREPARATION_ERROR,
    automaticPreparationProblemStatus(code),
  );
}

/** DDA-053: classify and optionally enqueue automatic safe preparation. */
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/automatic-preparation')
export class AutomaticPreparationController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly service: AutomaticPreparationEnqueueService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(ETL_PROPOSAL_REPOSITORY_PORT)
    private readonly proposals?: EtlProposalRepositoryPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post('evaluate')
  public async evaluate(@Req() request: unknown, @Body() dto: AutomaticPreparationEvaluateDtoV1) {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isStableIdentifier(dto.proposalId) ||
      !isNonEmptyText(dto.idempotencyKey) ||
      !Number.isSafeInteger(dto.expectedRevision) ||
      dto.expectedRevision < 1 ||
      Object.keys(dto).some(
        (key) => !new Set(['proposalId', 'idempotencyKey', 'expectedRevision']).has(key),
      )
    ) {
      throw new BadRequestException();
    }

    const context = await this.resolveContext(request);
    await this.requireScopedProposal(dto.proposalId, context.tenantScope);
    let result: Awaited<ReturnType<AutomaticPreparationEnqueueService['evaluateAndMaybeEnqueue']>>;
    try {
      const serviceInput = {
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        proposalId: dto.proposalId,
        idempotencyKey: dto.idempotencyKey,
        expectedRevision: dto.expectedRevision,
        correlationId: context.correlationId,
      };
      result = await this.service.evaluateAndMaybeEnqueue(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwAutomaticPreparationProblem(result.code);
    return this.toResponse(result.value);
  }

  private async requireScopedProposal(
    proposalId: string,
    tenantScope: Parameters<EtlProposalRepositoryPortV1['findById']>[1],
  ): Promise<void> {
    if (!this.proposals) throw new ServiceUnavailableException();
    try {
      const found = await this.proposals.findById(proposalId, tenantScope);
      if (!found) throwAutomaticPreparationProblem('DDA_ETL_NOT_FOUND');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  private rejectClientAuthority(body: unknown, request: unknown): void {
    const requestRecord =
      typeof request === 'object' && request !== null && !Array.isArray(request)
        ? (request as Record<string, unknown>)
        : undefined;
    if (
      hasClientAuthorityField(body) ||
      hasClientAuthorityField(requestRecord?.['body']) ||
      hasClientAuthorityField(requestRecord?.['query']) ||
      hasClientAuthorityField(requestRecord?.['params'])
    ) {
      throw new BadRequestException();
    }
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (error instanceof RequestTenantContextProblemError) {
        if (error.code === 'CONTEXT_INVALID') throw new BadRequestException();
        if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException();
        throw new ServiceUnavailableException();
      }
      throw new ServiceUnavailableException();
    }
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
