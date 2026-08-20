import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  parseV4Contract,
  type CrfReportCreateAccepted,
  type CrfReportCreateCommand,
  type CrfReportDetailAccepted,
  type CrfReportListAccepted,
  type CrfReportRunDetailAccepted,
} from '@databreeze/contracts/v4';
import { PERMISSIONS_V1, roleHasPermissionV1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  tenantScopeContainsV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  IAM_REPOSITORY_PORT,
  type IamRepositoryPortV1,
} from '../../iam/application/iam-repository.port.js';
import {
  IAM_HIERARCHY_REPOSITORY,
  type IamHierarchyRepositoryPortV1,
} from '../../iam/application/hierarchy-repository.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';
import {
  CRF_GOVERNED_DATASET_REPOSITORY_PORT,
  CRF_DATASET_VERSION_REPOSITORY_PORT,
  type CrfDatasetVersionRepositoryPortV1,
  type CrfGovernedDatasetRepositoryPortV1,
} from '../application/report.module-ports.js';
import {
  CRF_REPORT_REPOSITORY_PORT,
  type CrfReportDetailV1,
  type CrfReportRepositoryPortV1,
} from '../application/report-repository.port.js';
import { CrfReportService } from '../application/report.service.js';

const LIST_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-list-accepted' as const;
const DETAIL_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-detail-accepted' as const;
const RUN_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-run-detail-accepted' as const;
const CREATE_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-create-command' as const;
const CREATE_ACCEPTED_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v4/crf-report-create-accepted' as const;

const REPORT_SUMMARY_OPENAPI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'reportId',
    'name',
    'clientId',
    'period',
    'datasetId',
    'datasetVersionId',
    'status',
    'reportVersion',
    'updatedAt',
  ],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    reportId: { $ref: '#/components/schemas/Identifier' },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    clientId: { $ref: '#/components/schemas/Identifier' },
    period: { type: 'string', minLength: 1, maxLength: 64 },
    datasetId: { $ref: '#/components/schemas/Identifier' },
    datasetVersionId: { $ref: '#/components/schemas/Identifier' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'RUNNING', 'REVIEW', 'RELEASED', 'WITHDRAWN', 'BLOCKED'],
    },
    reportVersion: { type: 'integer', minimum: 1 },
    updatedAt: { type: 'string', format: 'date-time' },
    latestRunStatus: {
      type: 'string',
      enum: ['QUEUED', 'RUNNING', 'BLOCKED', 'REVIEW', 'RELEASED', 'FAILED'],
    },
  },
};

const REPORT_LIST_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'accepted', 'items'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    accepted: { type: 'boolean', enum: [true] },
    items: { type: 'array', maxItems: 50, items: REPORT_SUMMARY_OPENAPI_SCHEMA },
    nextCursor: { type: 'string', minLength: 16, maxLength: 512 },
  },
};

const REPORT_DETAIL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'accepted', 'report'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    accepted: { type: 'boolean', enum: [true] },
    report: {
      ...REPORT_SUMMARY_OPENAPI_SCHEMA,
      required: [
        ...REPORT_SUMMARY_OPENAPI_SCHEMA.required,
        'templateId',
        'templateVersion',
        'supportedFormats',
        'blockCount',
      ],
      properties: {
        ...REPORT_SUMMARY_OPENAPI_SCHEMA.properties,
        templateId: { $ref: '#/components/schemas/Identifier' },
        templateVersion: { type: 'integer', minimum: 1 },
        supportedFormats: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: { type: 'string', enum: ['DOCX', 'PPTX', 'XLSX', 'PDF', 'WEB'] },
        },
        blockCount: { type: 'integer', minimum: 0, maximum: 200 },
      },
    },
  },
};

const REPORT_RUN_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'accepted', 'run'],
  properties: {
    schemaVersion: { type: 'integer', enum: [4] },
    accepted: { type: 'boolean', enum: [true] },
    run: {
      type: 'object',
      additionalProperties: false,
      required: [
        'runId',
        'reportId',
        'reportVersion',
        'status',
        'createdAt',
        'frozen',
        'outputs',
        'evidence',
      ],
      properties: {
        runId: { $ref: '#/components/schemas/Identifier' },
        reportId: { $ref: '#/components/schemas/Identifier' },
        reportVersion: { type: 'integer', minimum: 1 },
        status: {
          type: 'string',
          enum: ['QUEUED', 'RUNNING', 'BLOCKED', 'REVIEW', 'RELEASED', 'FAILED'],
        },
        createdAt: { type: 'string', format: 'date-time' },
        finishedAt: { type: 'string', format: 'date-time' },
        frozen: { type: 'boolean', enum: [true] },
        jraBound: { type: 'boolean' },
        outputs: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'state'],
            properties: {
              format: { type: 'string', enum: ['DOCX', 'PPTX', 'XLSX', 'PDF', 'WEB'] },
              state: { type: 'string', enum: ['PENDING', 'READY', 'FAILED', 'WITHDRAWN'] },
              failureCode: { type: 'string', minLength: 1, maxLength: 64 },
            },
          },
        },
        evidence: {
          type: 'object',
          additionalProperties: false,
          required: ['factCount', 'referenceCount', 'complete'],
          properties: {
            factCount: { type: 'integer', minimum: 0, maximum: 10000 },
            referenceCount: { type: 'integer', minimum: 0, maximum: 100000 },
            complete: { type: 'boolean' },
          },
        },
      },
    },
  },
};

const AUTHORITY_KEYS = new Set([
  'tenant',
  'tenantId',
  'tenantScope',
  'organizationId',
  'workspaceId',
  'projectId',
  'actorId',
  'role',
  'roleId',
  'permissions',
  'authorized',
]);

function hasAuthority(value: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (depth > 24 || value === null || typeof value !== 'object') return depth > 24;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value))
    return value.length > 1024 || value.some((item) => hasAuthority(item, depth + 1, seen));
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_KEYS.has(key) || hasAuthority(child, depth + 1, seen),
  );
}

function requestKeys(request: unknown, property: string): readonly string[] {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return [];
  const value = (request as Record<string, unknown>)[property];
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [];
}

function rejectAuthority(request: unknown, body?: unknown): void {
  if (
    hasAuthority(body) ||
    requestKeys(request, 'body').some((key) => AUTHORITY_KEYS.has(key)) ||
    requestKeys(request, 'query').some((key) => !['limit', 'cursor'].includes(key)) ||
    requestKeys(request, 'params').some((key) => AUTHORITY_KEYS.has(key))
  )
    throw new BadRequestException();
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 25;
  if (!/^\d{1,2}$/u.test(value)) throw new BadRequestException();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) throw new BadRequestException();
  return parsed;
}

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new BadRequestException();
  return parsed.value;
}

function accepted<TValue>(schemaId: string, value: unknown): TValue {
  const parsed = parseV4Contract<TValue>(schemaId as never, value);
  if (!parsed.accepted) throw new ServiceUnavailableException();
  return parsed.value;
}

function summary(report: CrfReportDetailV1) {
  return {
    schemaVersion: 4 as const,
    reportId: report.reportId,
    name: report.name,
    clientId: report.clientId,
    period: report.period,
    datasetId: report.datasetId,
    datasetVersionId: report.datasetVersionId,
    status: report.status,
    reportVersion: report.reportVersion,
    updatedAt: report.updatedAt,
    ...(report.latestRunStatus === undefined ? {} : { latestRunStatus: report.latestRunStatus }),
  };
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('v1/reports')
export class CrfReportController {
  private readonly service: CrfReportService;

  public constructor(
    @Inject(CRF_REPORT_REPOSITORY_PORT) repository: CrfReportRepositoryPortV1,
    @Inject(CRF_GOVERNED_DATASET_REPOSITORY_PORT)
    governedDatasets: CrfGovernedDatasetRepositoryPortV1,
    @Inject(CRF_DATASET_VERSION_REPOSITORY_PORT) datasetVersions: CrfDatasetVersionRepositoryPortV1,
    @Inject(REQUEST_TENANT_CONTEXT) private readonly requestContext: RequestTenantContextPortV1,
    @Optional() @Inject(IAM_REPOSITORY_PORT) private readonly iam: IamRepositoryPortV1 | undefined,
    @Optional()
    @Inject(IAM_HIERARCHY_REPOSITORY)
    private readonly hierarchy?: IamHierarchyRepositoryPortV1,
  ) {
    this.service = new CrfReportService(repository, governedDatasets, datasetVersions, hierarchy);
  }

  @Get()
  @ApiOperation({ summary: 'List exact-scope client reports' })
  @ApiOkResponse({ schema: REPORT_LIST_RESPONSE_SCHEMA })
  public async list(
    @Req() request: unknown,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<CrfReportListAccepted> {
    rejectAuthority(request);
    const context = await this.resolveContext(request);
    await this.authorize(context, PERMISSIONS_V1.PROJECT_RECORD_READ);
    try {
      const page = await this.service.list(context, {
        limit: parseLimit(limit),
        ...(cursor === undefined ? {} : { cursor }),
      });
      return accepted<CrfReportListAccepted>(LIST_SCHEMA_ID, {
        schemaVersion: 4,
        accepted: true,
        ...page,
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  @Get(':reportId/runs/:runId')
  @ApiOperation({ summary: 'Read one exact-scope frozen report run projection' })
  @ApiOkResponse({ schema: REPORT_RUN_RESPONSE_SCHEMA })
  public async run(
    @Req() request: unknown,
    @Param('reportId') reportIdInput: string,
    @Param('runId') runIdInput: string,
  ): Promise<CrfReportRunDetailAccepted> {
    rejectAuthority(request);
    const reportId = id(reportIdInput);
    const runId = id(runIdInput);
    const context = await this.resolveContext(request);
    await this.authorize(context, PERMISSIONS_V1.PROJECT_RECORD_READ);
    try {
      const run = await this.service.findRun(context, reportId, runId);
      if (run === undefined) throw new NotFoundException();
      return accepted<CrfReportRunDetailAccepted>(RUN_SCHEMA_ID, {
        schemaVersion: 4,
        accepted: true,
        run,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  @Get(':reportId')
  @ApiOperation({ summary: 'Read one exact-scope client report definition' })
  @ApiOkResponse({ schema: REPORT_DETAIL_RESPONSE_SCHEMA })
  public async get(
    @Req() request: unknown,
    @Param('reportId') reportIdInput: string,
  ): Promise<CrfReportDetailAccepted> {
    rejectAuthority(request);
    const reportId = id(reportIdInput);
    const context = await this.resolveContext(request);
    await this.authorize(context, PERMISSIONS_V1.PROJECT_RECORD_READ);
    try {
      const report = await this.service.find(context, reportId);
      if (report === undefined) throw new NotFoundException();
      return accepted<CrfReportDetailAccepted>(DETAIL_SCHEMA_ID, {
        schemaVersion: 4,
        accepted: true,
        report,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a server-bound client report definition' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'name',
        'clientId',
        'period',
        'datasetId',
        'datasetVersionId',
        'supportedFormats',
      ],
      properties: {
        schemaVersion: { type: 'integer', enum: [4] },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        clientId: { $ref: '#/components/schemas/Identifier' },
        period: { type: 'string', minLength: 1, maxLength: 64 },
        datasetId: { $ref: '#/components/schemas/Identifier' },
        datasetVersionId: { $ref: '#/components/schemas/Identifier' },
        supportedFormats: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: { type: 'string', enum: ['DOCX', 'PPTX', 'XLSX', 'PDF', 'WEB'] },
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'accepted', 'report'],
      properties: {
        schemaVersion: { type: 'integer', enum: [4] },
        accepted: { type: 'boolean', enum: [true] },
        report: REPORT_SUMMARY_OPENAPI_SCHEMA,
      },
    },
  })
  public async create(
    @Req() request: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<CrfReportCreateAccepted> {
    rejectAuthority(request, body);
    if (idempotencyKey === undefined || !/^[A-Za-z0-9._~-]{8,200}$/u.test(idempotencyKey))
      throw new BadRequestException();
    const parsed = parseV4Contract<CrfReportCreateCommand>(CREATE_SCHEMA_ID, body);
    if (!parsed.accepted) throw new BadRequestException();
    const context = await this.resolveContext(request);
    await this.authorize(context, PERMISSIONS_V1.PROJECT_RECORD_MANAGE);
    try {
      const result = await this.service.create(context, parsed.value, idempotencyKey);
      if (!result.accepted) {
        if (result.code === 'DATASET_NOT_READY') throw new UnprocessableEntityException();
        if (result.code === 'DATASET_SCOPE_DENIED') throw new ForbiddenException();
        if (result.code === 'DATASET_NOT_FOUND') throw new NotFoundException();
        if (result.code === 'CLIENT_NOT_FOUND') throw new NotFoundException();
        if (result.code === 'CLIENT_SCOPE_DENIED') throw new ForbiddenException();
        if (result.code === 'IDEMPOTENCY_CONFLICT') throw new ConflictException();
        throw new BadRequestException();
      }
      return accepted<CrfReportCreateAccepted>(CREATE_ACCEPTED_SCHEMA_ID, {
        schemaVersion: 4,
        accepted: true,
        report: summary(result.value),
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      )
        throw error;
      throw new ServiceUnavailableException();
    }
  }

  private async resolveContext(request: unknown) {
    try {
      return await this.requestContext.resolve(request);
    } catch (error) {
      if (
        error instanceof RequestTenantContextProblemError &&
        error.code === 'AUTHENTICATION_FAILED'
      )
        throw new UnauthorizedException();
      if (error instanceof RequestTenantContextProblemError && error.code === 'CONTEXT_INVALID')
        throw new BadRequestException();
      throw new ServiceUnavailableException();
    }
  }

  private async authorize(
    context: Awaited<ReturnType<RequestTenantContextPortV1['resolve']>>,
    permission: (typeof PERMISSIONS_V1)[keyof typeof PERMISSIONS_V1],
  ): Promise<void> {
    if (this.iam === undefined) throw new ServiceUnavailableException();
    let membership;
    try {
      membership = await this.iam.findMembership(context, context.actorId);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (
      membership?.status !== 'ACTIVE' ||
      !tenantScopeContainsV1(membership.scope, context.tenantScope) ||
      !roleHasPermissionV1(membership.roleId, permission)
    )
      throw new ForbiddenException({ code: 'UNAUTHORIZED' });
  }
}
