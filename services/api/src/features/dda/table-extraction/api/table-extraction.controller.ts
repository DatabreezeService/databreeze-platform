import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
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

import {
  TABLE_EXTRACTION_AUTHORIZATION_PORT,
  UnavailableTableExtractionAuthorizationAdapter,
  type TableExtractionAuthorizationPortV1,
} from '../application/table-extraction-authorization.port.js';
import {
  TableExtractionService,
  type TableExtractionProblemCodeV1,
} from '../application/table-extraction.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

export interface TableExtractionRequestDtoV1 {
  readonly mimeType: string;
  readonly bytesBase64: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pageCount: number;
  readonly decompressionRatio?: number;
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
const SAFE_TABLE_EXTRACTION_ERROR = Object.freeze({ error: 'DDA_TABLE_EXTRACTION_REJECTED' });

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

function decodeBase64(value: string): Buffer {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new BadRequestException();
  }
  return Buffer.from(value, 'base64');
}

function tableExtractionProblemStatus(code: TableExtractionProblemCodeV1): HttpStatus {
  if (code === 'UNSUPPORTED_MIME') return HttpStatus.BAD_REQUEST;
  if (
    code === 'OVERSIZED_BYTES' ||
    code === 'OVERSIZED_PIXELS' ||
    code === 'OVERSIZED_PAGES' ||
    code === 'DECOMPRESSION_BOMB'
  )
    return HttpStatus.PAYLOAD_TOO_LARGE;
  if (code === 'CROSS_TENANT_ARTIFACT') return HttpStatus.NOT_FOUND;
  if (
    code === 'DUPLICATE_HEADER' ||
    code === 'RAGGED_ROW' ||
    code === 'LOW_CONFIDENCE' ||
    code === 'FORMULA_INJECTION' ||
    code === 'OFF_PAGE_COORDINATE' ||
    code === 'MISSING_COORDINATE' ||
    code === 'EXTRA_PROPERTY' ||
    code === 'UNSUPPORTED_PROFILE' ||
    code === 'EMPTY_TABLE' ||
    code === 'MALFORMED_JSON'
  )
    return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwTableExtractionProblem(code: TableExtractionProblemCodeV1): never {
  throw new HttpException(SAFE_TABLE_EXTRACTION_ERROR, tableExtractionProblemStatus(code));
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/table-extractions')
export class TableExtractionController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly authorization: TableExtractionAuthorizationPortV1;

  public constructor(
    private readonly service: TableExtractionService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(TABLE_EXTRACTION_AUTHORIZATION_PORT)
    authorization?: TableExtractionAuthorizationPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.authorization = authorization ?? new UnavailableTableExtractionAuthorizationAdapter();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  public async extract(@Req() request: unknown, @Body() dto: TableExtractionRequestDtoV1) {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isNonEmptyText(dto.mimeType) ||
      !isNonEmptyText(dto.bytesBase64) ||
      !Number.isSafeInteger(dto.widthPx) ||
      dto.widthPx < 1 ||
      !Number.isSafeInteger(dto.heightPx) ||
      dto.heightPx < 1 ||
      !Number.isSafeInteger(dto.pageCount) ||
      dto.pageCount < 1 ||
      (dto.decompressionRatio !== undefined &&
        (typeof dto.decompressionRatio !== 'number' ||
          !Number.isFinite(dto.decompressionRatio) ||
          dto.decompressionRatio < 1))
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    const bytes = decodeBase64(dto.bytesBase64);
    if (bytes.byteLength === 0) throw new BadRequestException();
    let decision: Awaited<ReturnType<TableExtractionAuthorizationPortV1['authorize']>>;
    try {
      decision = await this.authorization.authorize({
        context,
        mimeType: dto.mimeType,
        byteLength: bytes.byteLength,
        widthPx: dto.widthPx,
        heightPx: dto.heightPx,
        pageCount: dto.pageCount,
        ...(dto.decompressionRatio === undefined
          ? {}
          : { decompressionRatio: dto.decompressionRatio }),
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!decision.accepted) {
      if (decision.code === 'POLICY_UNAVAILABLE') throw new ServiceUnavailableException();
      throw new ForbiddenException();
    }

    let result: Awaited<ReturnType<TableExtractionService['extract']>>;
    try {
      const serviceInput = {
        actorId: context.actorId,
        mimeType: dto.mimeType,
        bytes,
        widthPx: dto.widthPx,
        heightPx: dto.heightPx,
        pageCount: dto.pageCount,
        ...(dto.decompressionRatio === undefined
          ? {}
          : { decompressionRatio: dto.decompressionRatio }),
      };
      result = await this.service.extract(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwTableExtractionProblem(result.code);
    return result;
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
