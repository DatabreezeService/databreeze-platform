import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Get,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { EtlReviewContextV1 } from '../application/etl-proposal-repository.port.js';
import {
  ETL_PROPOSAL_AUTHORITY_PORT,
  UnavailableEtlProposalAuthorityAdapter,
  type EtlProposalAuthorityPortV1,
} from '../application/etl-proposal-authority.port.js';
import {
  ETL_PROPOSAL_REPOSITORY_PORT,
  type EtlProposalRepositoryPortV1,
} from '../application/etl-proposal-repository.port.js';
import {
  EtlProposalServiceV1,
  type EtlProposalProblemCodeV1,
} from '../application/etl-proposal.service.js';
import type { EtlProposeDtoV1 } from './etl-proposal.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

interface EtlPlanAcceptanceSourceV1 {
  readonly contentHash?: unknown;
  readonly schemaHash?: unknown;
  readonly inputArtifactVersionId?: unknown;
  readonly transformations?: unknown[];
}

const AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'inputTenantScope',
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
const SAFE_ETL_PROPOSAL_ERROR = Object.freeze({ error: 'DDA_ETL_PROPOSAL_REJECTED' });

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

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isReviewContext(value: unknown): value is EtlReviewContextV1 {
  if (!isRecord(value)) return false;
  const arrays = [
    'sourceSchema',
    'inferredSchema',
    'targetSchema',
    'assumptions',
    'beforeSample',
    'afterSample',
    'exclusions',
    'unsupportedScopes',
    'qualityEffects',
    'aiSuggestions',
  ];
  if (!arrays.every((key) => Array.isArray(value[key]))) return false;
  const counts = value['counts'];
  if (
    !isRecord(counts) ||
    !isNonNegativeFinite(counts['changed']) ||
    !isNonNegativeFinite(counts['unchanged']) ||
    !isNonNegativeFinite(counts['rejected'])
  )
    return false;
  const sampling = value['sampling'];
  if (
    !isRecord(sampling) ||
    sampling['disclosed'] !== true ||
    sampling['method'] !== 'HEAD' ||
    !Number.isSafeInteger(sampling['seed']) ||
    !isNonNegativeFinite(sampling['rowCount'])
  )
    return false;
  const estimatedCost = value['estimatedCost'];
  if (
    !isRecord(estimatedCost) ||
    !isNonNegativeFinite(estimatedCost['cpuMs']) ||
    !isNonNegativeFinite(estimatedCost['memoryMb'])
  )
    return false;
  return (
    (value['evidenceStatus'] === 'AVAILABLE' ||
      value['evidenceStatus'] === 'PARTIAL' ||
      value['evidenceStatus'] === 'UNAVAILABLE') &&
    (value['sourceSchema'] as unknown[]).every((item) => isNonEmptyText(item)) &&
    (value['inferredSchema'] as unknown[]).every((item) => isNonEmptyText(item)) &&
    (value['targetSchema'] as unknown[]).every((item) => isNonEmptyText(item)) &&
    (value['assumptions'] as unknown[]).every((item) => isNonEmptyText(item))
  );
}

function proposalProblemStatus(code: EtlProposalProblemCodeV1): HttpStatus {
  if (code === 'DDA_ETL_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (code === 'DDA_ETL_AUTHORIZATION_DENIED') return HttpStatus.FORBIDDEN;
  if (code === 'DDA_ETL_AUTHORIZATION_UNAVAILABLE') return HttpStatus.SERVICE_UNAVAILABLE;
  if (code === 'DDA_ETL_ARBITRARY_CODE' || code === 'DDA_ETL_INVALID_PLAN') {
    return HttpStatus.BAD_REQUEST;
  }
  if (
    code === 'DDA_ETL_CYCLE' ||
    code === 'DDA_ETL_MISSING_VERSION_BINDING' ||
    code === 'DDA_ETL_UNSTABLE_ORDER' ||
    code === 'DDA_ETL_INCOMPLETE_GATE' ||
    code === 'DDA_ETL_UNDISCLOSED_SAMPLING' ||
    code === 'UNSUPPORTED_TRANSFORM'
  )
    return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwProposalProblem(code: EtlProposalProblemCodeV1): never {
  throw new HttpException(SAFE_ETL_PROPOSAL_ERROR, proposalProblemStatus(code));
}

function recordTenantScope(record: unknown): TenantScopeV1 | undefined {
  if (!isRecord(record)) return undefined;
  const plan = isRecord(record['plan']) ? record['plan'] : undefined;
  const candidate = record['tenantScope'] ?? plan?.['tenantScope'];
  const parsed = parseTenantScopeV1(candidate);
  return parsed.accepted ? parsed.value : undefined;
}

/** DDA-007: lineage parents are exact plan inputs, never invented IDs. */
export function lineageIdsFromEtlPlan(
  plan: EtlPlanAcceptanceSourceV1,
): readonly string[] | undefined {
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
    readonly counts: {
      readonly changed: number;
      readonly unchanged: number;
      readonly rejected: number;
    };
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
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly proposalAuthority: EtlProposalAuthorityPortV1;

  public constructor(
    private readonly service: EtlProposalServiceV1,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(ETL_PROPOSAL_REPOSITORY_PORT)
    private readonly proposals?: EtlProposalRepositoryPortV1,
    @Optional()
    @Inject(ETL_PROPOSAL_AUTHORITY_PORT)
    proposalAuthority?: EtlProposalAuthorityPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.proposalAuthority = proposalAuthority ?? new UnavailableEtlProposalAuthorityAdapter();
  }

  @Post()
  public async propose(@Req() request: unknown, @Body() dto: EtlProposeDtoV1) {
    this.rejectClientAuthority(dto, request);
    if (!isRecord(dto) || !isRecord(dto.planInput) || !isReviewContext(dto.reviewContext)) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    let result: Awaited<ReturnType<EtlProposalServiceV1['propose']>>;
    try {
      const requestedPlanInput = {
        ...dto.planInput,
        tenantScope: context.tenantScope,
      };
      const resolved = await this.proposalAuthority.authorizeAndResolve({
        context,
        action: 'ETL_PROPOSE',
        planInput: requestedPlanInput,
        reviewContext: dto.reviewContext as unknown as EtlReviewContextV1,
      });
      if (!resolved.accepted) {
        throwProposalProblem(
          resolved.code === 'FORBIDDEN' || resolved.code === 'RESOURCE_SCOPE_DENIED'
            ? 'DDA_ETL_AUTHORIZATION_DENIED'
            : 'DDA_ETL_AUTHORIZATION_UNAVAILABLE',
        );
      }
      if (
        !isRecord(resolved.value.planInput) ||
        !isReviewContext(resolved.value.reviewContext) ||
        !isRecord(resolved.value.planInput['tenantScope'])
      ) {
        throw new ServiceUnavailableException();
      }
      const resolvedScope = parseTenantScopeV1(resolved.value.planInput['tenantScope']);
      if (
        !resolvedScope.accepted ||
        !tenantScopesEqualV1(context.tenantScope, resolvedScope.value)
      ) {
        throw new ServiceUnavailableException();
      }
      const serviceInput = {
        actorId: context.actorId,
        planInput: resolved.value.planInput,
        reviewContext: resolved.value.reviewContext,
      };
      result = await this.service.propose(serviceInput);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwProposalProblem(result.code);
    const scope = recordTenantScope(result.value);
    if (!scope || !tenantScopesEqualV1(context.tenantScope, scope)) {
      throw new ServiceUnavailableException();
    }
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
  public async get(@Req() request: unknown, @Param('proposalId') proposalId: string) {
    this.rejectClientAuthority(undefined, request);
    const parsedProposalId = parseStableIdentifierV1(proposalId);
    if (!parsedProposalId.accepted) throw new BadRequestException();
    const context = await this.resolveContext(request);
    if (!this.proposals) throw new ServiceUnavailableException();

    let record: Awaited<ReturnType<EtlProposalRepositoryPortV1['findById']>>;
    try {
      record = await this.proposals.findById(parsedProposalId.value, context.tenantScope);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!record) throwProposalProblem('DDA_ETL_NOT_FOUND');
    const scope = recordTenantScope(record);
    if (!scope || !tenantScopeContainsV1(context.tenantScope, scope)) {
      throwProposalProblem('DDA_ETL_NOT_FOUND');
    }
    const plan = record.plan as EtlPlanAcceptanceSourceV1;
    const acceptanceEvidence = acceptanceEvidenceFromProposal({
      state: record.state,
      revision: record.revision,
      plan,
      review: record.review,
    });
    return {
      accepted: true,
      proposalId: record.proposalId,
      revision: record.revision,
      state: record.state,
      blockingReasons: record.blockingReasons,
      sourceSchema: record.review.sourceSchema,
      inferredSchema: record.review.inferredSchema,
      targetSchema: record.review.targetSchema,
      assumptions: record.review.assumptions,
      counts: record.review.counts,
      exclusions: record.review.exclusions,
      unsupportedScopes: record.review.unsupportedScopes,
      qualityEffects: record.review.qualityEffects,
      evidenceStatus: record.review.evidenceStatus,
      estimatedCost: record.review.estimatedCost,
      orderedSteps: plan.transformations ?? [],
      ...(acceptanceEvidence === undefined ? {} : { acceptanceEvidence }),
    };
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
