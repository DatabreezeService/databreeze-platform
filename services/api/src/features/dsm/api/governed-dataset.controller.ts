import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import { NotReadyError } from '../../system/application/not-ready.error.js';

import {
  GOVERNED_DATASET_AUTHORIZATION_PORT,
  type GovernedDatasetAuthorizationActionV1,
  type GovernedDatasetAuthorizationInputV1,
  type GovernedDatasetAuthorizationPortV1,
  type GovernedDatasetAuthorizationResultV1,
  isGovernedDatasetAuthorizationResultV1,
} from '../application/governed-dataset-authorization.port.js';
import {
  GOVERNED_DATASET_REPOSITORY_PORT,
  type GovernedDatasetRepositoryPortV1,
} from '../application/governed-dataset-repository.port.js';
import {
  GovernedDatasetService,
  type GovernedDatasetIndexEntryV1,
  type GovernedDatasetServiceResultV1,
  encodeGovernedDatasetIndexCursorV1,
} from '../application/governed-dataset.service.js';
import {
  CreateGovernedDatasetDto,
  ListGovernedDatasetQueryDto,
  PublishGovernedDatasetDto,
} from './governed-dataset.dto.js';
import {
  REQUEST_TENANT_CONTEXT,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

const AUTHORITY_FIELDS = new Set([
  'tenant',
  'tenantId',
  'tenantScope',
  'organizationId',
  'workspaceId',
  'projectId',
  'actorId',
  'memberId',
  'membershipId',
  'membershipStatus',
  'role',
  'roleId',
  'preset',
  'accessPreset',
  'permission',
  'permissions',
  'authorization',
  'authorized',
  'effectivePermission',
  'effectivePreset',
  'deniedDatasetIds',
]);

const MAX_AUTHORITY_SCAN_DEPTH = 32;
const MAX_AUTHORITY_SCAN_NODES = 4096;
const MAX_AUTHORITY_SCAN_KEYS = 8192;
const MAX_AUTHORITY_SCAN_ARRAY_LENGTH = 1024;
const MAX_INDEX_AUTHORIZATION_SCAN_PAGES = 64;
const MAX_INDEX_AUTHORIZATION_SCAN_ROWS = 4096;

export function hasClientAuthorityField(value: unknown): boolean {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let keys = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) return true;
    if (current.depth > MAX_AUTHORITY_SCAN_DEPTH) return true;
    if (typeof current.value !== 'object' || current.value === null) continue;
    if (seen.has(current.value)) return true;
    seen.add(current.value);
    nodes += 1;
    if (nodes > MAX_AUTHORITY_SCAN_NODES) return true;

    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_AUTHORITY_SCAN_ARRAY_LENGTH) return true;
      for (const child of current.value) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }

    let entries: [string, unknown][];
    try {
      entries = Object.entries(current.value);
    } catch {
      return true;
    }
    keys += entries.length;
    if (keys > MAX_AUTHORITY_SCAN_KEYS) return true;
    for (const [key, child] of entries) {
      if (AUTHORITY_FIELDS.has(key)) return true;
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return false;
}

function isReadAction(action: GovernedDatasetAuthorizationActionV1): boolean {
  return action === 'READ_INDEX' || action === 'READ_VERSION';
}

function isHiddenReadDenial(code: string): boolean {
  return new Set([
    'MEMBERSHIP_NOT_FOUND',
    'MEMBERSHIP_REVOKED',
    'DATASET_RESTRICTED',
    'ACTION_DENIED',
    'SCOPE_DENIED',
    'NOT_FOUND',
    'FORBIDDEN',
  ]).has(code);
}

function isHiddenResourceDenial(code: string): boolean {
  return new Set([
    'MEMBERSHIP_NOT_FOUND',
    'MEMBERSHIP_REVOKED',
    'DATASET_RESTRICTED',
    'SCOPE_DENIED',
    'NOT_FOUND',
    'FORBIDDEN',
  ]).has(code);
}

function authorizationProblem(action: GovernedDatasetAuthorizationActionV1, code: string): never {
  if (code === 'AUTHORIZATION_UNAVAILABLE') throw new NotReadyError();
  if (code === 'INVALID_IDENTIFIER' || code === 'INVALID_SCOPE') throw new BadRequestException();
  if (isReadAction(action) && isHiddenReadDenial(code)) throw new NotFoundException();
  if (isHiddenResourceDenial(code)) throw new NotFoundException();
  throw new ForbiddenException();
}

function serviceProblem(code: string): never {
  if (code === 'VERSION_NOT_FOUND') throw new NotFoundException();
  if (code === 'INCOMPATIBLE_SCHEMA') throw new UnprocessableEntityException();
  if (
    code === 'INVALID_STATE' ||
    code === 'REVISION_CONFLICT' ||
    code === 'CONFLICT' ||
    code === 'IDEMPOTENCY_CONFLICT' ||
    code === 'DSM_IMMUTABLE_DEFINITION' ||
    code === 'DSM_REVISION_CONFLICT'
  )
    throw new ConflictException();
  if (
    code === 'INVALID_IDENTIFIER' ||
    code === 'INVALID_SCOPE' ||
    code === 'INVALID_TIMESTAMP' ||
    code === 'INVALID_TEXT' ||
    code === 'INVALID_FIELD' ||
    code === 'DUPLICATE_FIELD' ||
    code === 'INVALID_HASH' ||
    code === 'INVALID_COUNT' ||
    code === 'INVALID_QUALITY_STATE' ||
    code === 'INVALID_CURSOR' ||
    code === 'INVALID_LIMIT'
  )
    throw new BadRequestException();
  throw new NotReadyError();
}

function requireServiceResult<TValue>(result: GovernedDatasetServiceResultV1<TValue>): {
  readonly accepted: true;
  readonly value: TValue;
} {
  if (!result.accepted) serviceProblem(result.code);
  return result;
}

function requireIdentifier(input: unknown): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(input);
  if (!parsed.accepted) throw new BadRequestException();
  return parsed.value;
}

function preserveHttpException(error: unknown): never | undefined {
  if (
    error instanceof BadRequestException ||
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException ||
    error instanceof ServiceUnavailableException ||
    error instanceof UnprocessableEntityException
  ) {
    throw error;
  }
  return undefined;
}

function serviceThrown(error: unknown): never {
  preserveHttpException(error);
  if (
    error instanceof Error &&
    (error.message === 'DSM_IMMUTABLE_DEFINITION' ||
      error.message === 'DSM_REVISION_CONFLICT' ||
      error.message === 'DSM_IDEMPOTENCY_CONFLICT')
  ) {
    throw new ConflictException();
  }
  throw new NotReadyError();
}

@ApiTags('datasets')
@ApiBearerAuth()
@Controller('v1/datasets')
export class GovernedDatasetController {
  private readonly datasets: GovernedDatasetService;

  public constructor(
    @Inject(GOVERNED_DATASET_REPOSITORY_PORT)
    repository: GovernedDatasetRepositoryPortV1,
    @Inject(GOVERNED_DATASET_AUTHORIZATION_PORT)
    private readonly authorization: GovernedDatasetAuthorizationPortV1,
    @Inject(REQUEST_TENANT_CONTEXT)
    private readonly requestContext: RequestTenantContextPortV1,
  ) {
    this.datasets = new GovernedDatasetService(repository);
  }

  @Post()
  @ApiOperation({ summary: 'Create an immutable governed dataset definition draft' })
  @ApiBody({ type: CreateGovernedDatasetDto })
  async create(@Req() request: unknown, @Body() input: CreateGovernedDatasetDto): Promise<unknown> {
    this.rejectClientAuthority(request, input);
    const context = await this.requestContext.resolve(request);
    const datasetId = requireIdentifier(input.datasetId);
    const versionId = requireIdentifier(input.versionId);
    await this.requireAuthorization(context, {
      action: 'CREATE_DRAFT',
      datasetId,
      versionId,
    });
    return this.serviceResult(() =>
      this.datasets.create(context, {
        ...input,
        datasetId,
        versionId,
        tenantScope: context.tenantScope,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List latest published logical datasets visible to the caller' })
  async listIndex(
    @Req() request: unknown,
    @Query() query: ListGovernedDatasetQueryDto,
  ): Promise<unknown> {
    this.rejectClientAuthority(request, query);
    const context = await this.requestContext.resolve(request);
    await this.requireAuthorization(context, { action: 'READ_INDEX' });
    const visible: GovernedDatasetIndexEntryV1[] = [];
    let scanCursor = query.cursor;
    let requestedLimit = query.limit;
    let publicNextCursor: string | undefined;
    let scanPages = 0;
    let scanRows = 0;

    while (visible.length < (requestedLimit ?? Number.MAX_SAFE_INTEGER)) {
      scanPages += 1;
      if (scanPages > MAX_INDEX_AUTHORIZATION_SCAN_PAGES) throw new NotReadyError();
      const result = await this.serviceResult(() =>
        this.datasets.listIndex(context, scanCursor, requestedLimit),
      );
      requestedLimit ??= result.value.page.limit;
      scanRows += result.value.datasets.length;
      if (scanRows > MAX_INDEX_AUTHORIZATION_SCAN_ROWS) throw new NotReadyError();

      let foundVisibleBeyondLimit = false;
      for (const entry of result.value.datasets) {
        const decision = await this.authorizationResult(context, {
          action: 'READ_VERSION',
          datasetId: entry.datasetId,
          versionId: entry.versionId,
        });
        if (!decision.accepted) {
          if (isHiddenReadDenial(decision.code)) continue;
          authorizationProblem('READ_VERSION', decision.code);
        }
        if (visible.length < requestedLimit) {
          visible.push(entry);
        } else {
          foundVisibleBeyondLimit = true;
          break;
        }
      }

      if (requestedLimit !== undefined && visible.length >= requestedLimit) {
        if (foundVisibleBeyondLimit || result.value.page.nextCursor !== undefined) {
          const lastVisible = visible[visible.length - 1];
          if (lastVisible !== undefined) {
            publicNextCursor = encodeGovernedDatasetIndexCursorV1(lastVisible.datasetId);
          }
        }
        break;
      }
      if (result.value.page.nextCursor === undefined) break;
      scanCursor = result.value.page.nextCursor;
    }

    const limit = requestedLimit ?? 25;
    return {
      accepted: true,
      value: {
        page: {
          limit,
          ...(publicNextCursor === undefined ? {} : { nextCursor: publicNextCursor }),
        },
        datasets: Object.freeze(visible),
      },
    };
  }

  @Get(':datasetId/versions')
  @ApiOperation({ summary: 'List governed dataset versions visible to the caller' })
  async list(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
  ): Promise<unknown> {
    this.rejectClientAuthority(request);
    const context = await this.requestContext.resolve(request);
    const datasetId = requireIdentifier(datasetIdInput);
    await this.requireAuthorization(context, { action: 'READ_VERSION', datasetId });
    return this.serviceList(() => this.datasets.list(context, datasetId));
  }

  @Get(':datasetId/versions/:versionId')
  @ApiOperation({ summary: 'Read one exact immutable governed dataset definition' })
  async getVersion(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Param('versionId') versionIdInput: string,
  ): Promise<unknown> {
    this.rejectClientAuthority(request);
    const context = await this.requestContext.resolve(request);
    const datasetId = requireIdentifier(datasetIdInput);
    const versionId = requireIdentifier(versionIdInput);
    await this.requireAuthorization(context, { action: 'READ_VERSION', datasetId, versionId });
    const result = await this.serviceResult(() => this.datasets.find(context, versionId));
    if (result.value.datasetId !== datasetId) throw new NotFoundException();
    return result;
  }

  @Post(':datasetId/versions/:versionId/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a governed dataset definition as a new immutable version' })
  @ApiBody({ type: PublishGovernedDatasetDto })
  async publish(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Param('versionId') versionIdInput: string,
    @Body() input: PublishGovernedDatasetDto,
  ): Promise<unknown> {
    this.rejectClientAuthority(request, input);
    const context = await this.requestContext.resolve(request);
    const datasetId = requireIdentifier(datasetIdInput);
    const versionId = requireIdentifier(versionIdInput);
    const nextVersionId = requireIdentifier(input.nextVersionId);
    await this.requireAuthorization(context, { action: 'PUBLISH', datasetId, versionId });
    const current = await this.serviceResult(() => this.datasets.find(context, versionId));
    if (current.value.datasetId !== datasetId) throw new NotFoundException();
    return this.serviceResult(() =>
      this.datasets.publish(context, versionId, nextVersionId, input.publishedAt),
    );
  }

  @Get(':datasetId/compatibility')
  @ApiOperation({ summary: 'Classify compatibility between two exact schema versions' })
  async compare(
    @Req() request: unknown,
    @Param('datasetId') datasetIdInput: string,
    @Query('previousVersionId') previousVersionIdInput: string,
    @Query('nextVersionId') nextVersionIdInput: string,
  ): Promise<unknown> {
    this.rejectClientAuthority(request);
    const context = await this.requestContext.resolve(request);
    const datasetId = requireIdentifier(datasetIdInput);
    const previousVersionId = requireIdentifier(previousVersionIdInput);
    const nextVersionId = requireIdentifier(nextVersionIdInput);
    await this.requireAuthorization(context, {
      action: 'READ_VERSION',
      datasetId,
      versionId: previousVersionId,
    });
    await this.requireAuthorization(context, {
      action: 'READ_VERSION',
      datasetId,
      versionId: nextVersionId,
    });
    const [previous, next] = await Promise.all([
      this.serviceResult(() => this.datasets.find(context, previousVersionId)),
      this.serviceResult(() => this.datasets.find(context, nextVersionId)),
    ]);
    if (previous.value.datasetId !== datasetId || next.value.datasetId !== datasetId)
      throw new NotFoundException();
    await this.requireAuthorization(context, {
      action: 'COMPARE',
      datasetId,
      versionId: nextVersionId,
    });
    return this.serviceResult(() =>
      this.datasets.compare(context, previousVersionId, nextVersionId),
    );
  }

  private rejectClientAuthority(request: unknown, body?: unknown): void {
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

  private async authorizationResult(
    context: IamTenantContextV1,
    input: GovernedDatasetAuthorizationInputV1,
  ): Promise<GovernedDatasetAuthorizationResultV1> {
    try {
      const result = await this.authorization.authorize(context, input);
      if (!isGovernedDatasetAuthorizationResultV1(result)) throw new NotReadyError();
      return result;
    } catch {
      throw new NotReadyError();
    }
  }

  private async requireAuthorization(
    context: IamTenantContextV1,
    input: GovernedDatasetAuthorizationInputV1,
  ): Promise<void> {
    const result = await this.authorizationResult(context, input);
    if (!result.accepted) authorizationProblem(input.action, result.code);
  }

  private async serviceResult<TValue>(
    operation: () => Promise<GovernedDatasetServiceResultV1<TValue>>,
  ): Promise<{ readonly accepted: true; readonly value: TValue }> {
    try {
      return requireServiceResult(await operation());
    } catch (error) {
      serviceThrown(error);
    }
  }

  private async serviceList<TValue>(
    operation: () => Promise<readonly TValue[]>,
  ): Promise<readonly TValue[]> {
    try {
      return await operation();
    } catch (error) {
      serviceThrown(error);
    }
  }
}
