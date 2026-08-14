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

import type { EtlAcceptanceProblemCodeV1 } from '../application/etl-acceptance.service.js';
import { EtlAcceptanceServiceV1 } from '../application/etl-acceptance.service.js';
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

export interface EtlAcceptDtoV1 {
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
]);
const SAFE_ETL_ACCEPTANCE_ERROR = Object.freeze({ error: 'DDA_ETL_ACCEPTANCE_REJECTED' });

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

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isExpected(value: unknown): value is EtlAcceptDtoV1['expected'] {
  if (!isRecord(value)) return false;
  return (
    Number.isSafeInteger(value['rowCount']) &&
    (value['rowCount'] as number) >= 0 &&
    Number.isSafeInteger(value['rejectedCount']) &&
    (value['rejectedCount'] as number) >= 0 &&
    isHash(value['contentHash']) &&
    isHash(value['schemaHash']) &&
    Array.isArray(value['lineageIds']) &&
    value['lineageIds'].every((id) => isStableIdentifier(id))
  );
}

function acceptanceProblemStatus(code: EtlAcceptanceProblemCodeV1): HttpStatus {
  if (code === 'DDA_ETL_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (
    code === 'DDA_ETL_REVISION_CONFLICT' ||
    code === 'DDA_ETL_STALE_PROPOSAL' ||
    code === 'DDA_ETL_POLICY_CHANGED'
  )
    return HttpStatus.CONFLICT;
  if (code === 'DDA_ETL_BUA_DENIED') return HttpStatus.TOO_MANY_REQUESTS;
  if (
    code === 'DDA_ETL_PARTIAL_OUTPUT' ||
    code === 'DDA_ETL_COUNT_MISMATCH' ||
    code === 'DDA_ETL_HASH_MISMATCH' ||
    code === 'DDA_ETL_SCHEMA_MISMATCH' ||
    code === 'DDA_ETL_MISSING_REJECT_BUNDLE' ||
    code === 'DDA_ETL_LINEAGE_MISMATCH'
  )
    return HttpStatus.UNPROCESSABLE_ENTITY;
  if (code === 'DDA_ETL_AUTHORIZATION_DENIED') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_ETL_COMMAND_CONFLICT') return HttpStatus.CONFLICT;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwAcceptanceProblem(code: EtlAcceptanceProblemCodeV1): never {
  throw new HttpException(SAFE_ETL_ACCEPTANCE_ERROR, acceptanceProblemStatus(code));
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/etl-acceptances')
export class EtlAcceptanceController {
  private readonly requestContext: RequestTenantContextPortV1;

  public constructor(
    private readonly service: EtlAcceptanceServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(ETL_PROPOSAL_REPOSITORY_PORT)
    private readonly proposals?: EtlProposalRepositoryPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
  }

  @Post()
  public async accept(@Req() request: unknown, @Body() dto: EtlAcceptDtoV1) {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isStableIdentifier(dto.proposalId) ||
      !Number.isSafeInteger(dto.expectedRevision) ||
      dto.expectedRevision < 1 ||
      !isNonEmptyText(dto.idempotencyKey) ||
      !isStableIdentifier(dto.correlationId) ||
      !isExpected(dto.expected)
    ) {
      throw new BadRequestException();
    }

    const context = await this.resolveContext(request);
    await this.requireScopedProposal(dto.proposalId, context.tenantScope);
    let result: Awaited<ReturnType<EtlAcceptanceServiceV1['accept']>>;
    try {
      const serviceInput = {
        tenantScope: context.tenantScope,
        context,
        actorId: context.actorId,
        proposalId: dto.proposalId,
        expectedRevision: dto.expectedRevision,
        idempotencyKey: dto.idempotencyKey,
        correlationId: dto.correlationId,
        expected: dto.expected,
      };
      result = await this.service.accept(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwAcceptanceProblem(result.code);
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

  private async requireScopedProposal(
    proposalId: string,
    tenantScope: Parameters<EtlProposalRepositoryPortV1['findById']>[1],
  ): Promise<void> {
    if (!this.proposals) throw new ServiceUnavailableException();
    try {
      const found = await this.proposals.findById(proposalId, tenantScope);
      if (!found) throwAcceptanceProblem('DDA_ETL_NOT_FOUND');
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
}
