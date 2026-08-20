import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  ReceiptExtractionService,
  type ReceiptExtractionErrorCode,
} from '../application/receipt-extraction.service.js';
import {
  RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT,
  UnavailableReceiptExtractionCommandRepositoryAdapter,
  type ReceiptExtractionCommandRepositoryPortV1,
} from '../application/receipt-extraction-command.port.js';
import {
  RECEIPT_MUTATION_AUTHORIZATION_PORT,
  UnavailableReceiptMutationAuthorizationAdapter,
  type ReceiptMutationAuthorizationPortV1,
} from '../application/receipt-mutation-authorization.port.js';
import type {
  ReceiptCandidateReadQueryDto,
  ReceiptCorrectionRequestDto,
  ReceiptExtractionRequestDto,
  ReceiptIntakeRequestDto,
  ReceiptAcceptanceRequestDto,
} from './receipt-extraction.dto.js';
import {
  INTAKE_IAE_UPLOAD_PORT,
  type IntakeIaeUploadPortV1,
} from '../../intake/application/intake-profile.port.js';
import { ReceiptAcceptanceService } from '../application/receipt-acceptance.service.js';
import type { ReceiptValidationInput } from '../application/receipt-validation.service.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

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
const SAFE_RECEIPT_ERROR = Object.freeze({ error: 'DDA_RECEIPT_REJECTED' });

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

function isFieldUpdates(value: unknown): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, child]) => isNonEmptyText(key) && typeof child === 'string' && child.length <= 10_000,
    )
  );
}

function receiptProblemStatus(code: ReceiptExtractionErrorCode): HttpStatus {
  if (code === 'WRONG_SCOPE_ARTIFACT' || code === 'CANDIDATE_NOT_FOUND') {
    return HttpStatus.NOT_FOUND;
  }
  if (
    code === 'AI_EGRESS_DENIED' ||
    code === 'PURPOSE_DENIED' ||
    code === 'EVIDENCE_TRANSFER_DENIED' ||
    code === 'DISCLOSURE_MISSING' ||
    code === 'TENANT_REVOKED'
  )
    return HttpStatus.FORBIDDEN;
  if (code === 'ADMISSION_DENIED') return HttpStatus.TOO_MANY_REQUESTS;
  if (
    code === 'NON_RECEIPT_PROFILE' ||
    code === 'UNSUPPORTED_CONTENT_TYPE' ||
    code === 'INVALID_CORRECTION'
  )
    return HttpStatus.BAD_REQUEST;
  if (code === 'AUTHORIZATION_DENIED') return HttpStatus.FORBIDDEN;
  if (code === 'COMMAND_CONFLICT') return HttpStatus.CONFLICT;
  if (code === 'HASH_MISMATCH' || code === 'PAYLOAD_OVERSIZE' || code === 'MALFORMED_COORDINATES')
    return HttpStatus.UNPROCESSABLE_ENTITY;
  return HttpStatus.SERVICE_UNAVAILABLE;
}

function throwReceiptProblem(code: ReceiptExtractionErrorCode): never {
  throw new HttpException(SAFE_RECEIPT_ERROR, receiptProblemStatus(code));
}

/** Nest HTTP surface for governed receipt extraction and correction. */
@ApiTags('dda-receipts')
@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/receipts')
export class ReceiptExtractionController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly commands: ReceiptExtractionCommandRepositoryPortV1;
  private readonly mutationAuthorization: ReceiptMutationAuthorizationPortV1;
  private readonly intakeUpload: IntakeIaeUploadPortV1 | undefined;

  public constructor(
    private readonly service: ReceiptExtractionService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT)
    commands?: ReceiptExtractionCommandRepositoryPortV1,
    @Optional()
    @Inject(RECEIPT_MUTATION_AUTHORIZATION_PORT)
    mutationAuthorization?: ReceiptMutationAuthorizationPortV1,
    @Optional()
    @Inject(INTAKE_IAE_UPLOAD_PORT)
    intakeUpload?: IntakeIaeUploadPortV1,
    @Optional()
    private readonly acceptance?: ReceiptAcceptanceService,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.commands = commands ?? new UnavailableReceiptExtractionCommandRepositoryAdapter();
    this.mutationAuthorization =
      mutationAuthorization ?? new UnavailableReceiptMutationAuthorizationAdapter();
    this.intakeUpload = intakeUpload;
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  public async accept(
    @Req() request: unknown,
    @Body() body: ReceiptAcceptanceRequestDto,
  ): Promise<Record<string, unknown>> {
    this.rejectClientAuthority(body, request);
    if (
      this.acceptance === undefined ||
      !isRecord(body) ||
      !isStableIdentifier(body.candidateId) ||
      !isStableIdentifier(body.artifactVersionId) ||
      !/^[a-f0-9]{64}$/u.test(body.artifactContentHash) ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 1 ||
      !isStableIdentifier(body.correlationId) ||
      (body.idempotencyKey !== undefined && !isNonEmptyText(body.idempotencyKey)) ||
      !isRecord(body.record)
    ) {
      throw new BadRequestException();
    }
    const record = body.record as unknown as ReceiptValidationInput;
    if (!this.isValidationRecord(record)) throw new BadRequestException();
    const context = await this.resolveContext(request);
    let result;
    try {
      result = await this.acceptance.accept({
        tenantScope: context.tenantScope,
        candidateId: body.candidateId,
        artifactVersionId: body.artifactVersionId,
        artifactContentHash: body.artifactContentHash,
        expectedRevision: body.expectedRevision,
        correlationId: body.correlationId,
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
        record,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) {
      if (result.code === 'EXPECTED_REVISION_CONFLICT')
        throw new HttpException(SAFE_RECEIPT_ERROR, HttpStatus.CONFLICT);
      if (result.code === 'DSM_FAILURE' || result.code === 'IAE_FAILURE')
        throw new ServiceUnavailableException();
      throw new BadRequestException({ error: 'DDA_RECEIPT_REVIEW_REQUIRED' });
    }
    return Object.freeze({ accepted: true, value: result.value });
  }

  /** Mobile-friendly bounded intake. IAE remains authoritative for IDs, scope and placement. */
  @Post('intake')
  @HttpCode(HttpStatus.OK)
  public async intake(
    @Req() request: unknown,
    @Body() body: ReceiptIntakeRequestDto,
  ): Promise<Record<string, unknown>> {
    this.rejectClientAuthority(body, request);
    if (
      !isRecord(body) ||
      !isNonEmptyText(body.fileName) ||
      body.fileName.length > 255 ||
      body.fileName.includes('/') ||
      body.fileName.includes('\\') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ||
      !/^[a-f0-9]{64}$/u.test(body.expectedSha256) ||
      !isNonEmptyText(body.contentBase64) ||
      body.contentBase64.length > 700_000 ||
      !isNonEmptyText(body.idempotencyKey)
    ) {
      throw new BadRequestException();
    }
    if (this.intakeUpload === undefined) throw new ServiceUnavailableException();
    const context = await this.resolveContext(request);
    let bytes: Buffer;
    try {
      if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(body.contentBase64)) throw new Error('invalid_base64');
      bytes = Buffer.from(body.contentBase64, 'base64');
      if (bytes.byteLength < 1 || bytes.byteLength > 512_000) throw new Error('invalid_size');
    } catch {
      throw new BadRequestException();
    }
    const result = await this.intakeUpload.upload(context, {
      tenantScope: context.tenantScope,
      fileName: body.fileName,
      mediaType: body.mediaType,
      expectedSha256: body.expectedSha256,
      bytes,
      idempotencyKey: body.idempotencyKey,
    });
    if (!result.accepted) {
      if (
        result.code === 'LOCAL_INTAKE_SCOPE_DENIED' ||
        result.code === 'LOCAL_INTAKE_PERMISSION_DENIED'
      ) {
        throw new HttpException(SAFE_RECEIPT_ERROR, HttpStatus.FORBIDDEN);
      }
      if (
        result.code === 'LOCAL_INTAKE_INVALID_INPUT' ||
        result.code === 'LOCAL_INTAKE_IDEMPOTENCY_CONFLICT'
      ) {
        throw new BadRequestException();
      }
      throw new ServiceUnavailableException();
    }
    return Object.freeze({ accepted: true, value: Object.freeze(result.value) });
  }

  /** Profile identity is server configuration, never an APK constant. */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  public profile(): Record<string, string> {
    const profileVersionId = process.env['DATABREEZE_RECEIPT_PROFILE_VERSION_ID'];
    if (!isStableIdentifier(profileVersionId)) throw new ServiceUnavailableException();
    return Object.freeze({ profileVersionId, profileKind: 'receipt' });
  }

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  public async extract(
    @Req() request: unknown,
    @Body() body: ReceiptExtractionRequestDto,
  ): Promise<Record<string, unknown>> {
    this.rejectClientAuthority(body, request);
    if (
      !isRecord(body) ||
      !isStableIdentifier(body.artifactVersionId) ||
      !isStableIdentifier(body.profileVersionId) ||
      !isNonEmptyText(body.profileKind) ||
      !isStableIdentifier(body.correlationId) ||
      (body.idempotencyKey !== undefined && !isNonEmptyText(body.idempotencyKey))
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    let result: Awaited<ReturnType<ReceiptExtractionService['extract']>>;
    try {
      const serviceInput = {
        tenantScope: context.tenantScope,
        context,
        actorId: context.actorId,
        artifactVersionId: body.artifactVersionId,
        profileVersionId: body.profileVersionId,
        profileKind: body.profileKind,
        correlationId: body.correlationId,
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      };
      result = await this.service.extract(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwReceiptProblem(result.code);
    return result.value as unknown as Record<string, unknown>;
  }

  @Post('correct')
  @HttpCode(HttpStatus.OK)
  public async correct(
    @Req() request: unknown,
    @Body() body: ReceiptCorrectionRequestDto,
  ): Promise<Record<string, unknown>> {
    this.rejectClientAuthority(body, request);
    if (
      !isRecord(body) ||
      !isStableIdentifier(body.priorCandidateId) ||
      !isStableIdentifier(body.artifactVersionId) ||
      !isStableIdentifier(body.correlationId) ||
      !isFieldUpdates(body.fieldUpdates) ||
      (body.idempotencyKey !== undefined && !isNonEmptyText(body.idempotencyKey))
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    let result: Awaited<ReturnType<ReceiptExtractionService['correct']>>;
    try {
      const serviceInput = {
        tenantScope: context.tenantScope,
        context,
        actorId: context.actorId,
        priorCandidateId: body.priorCandidateId,
        artifactVersionId: body.artifactVersionId,
        correlationId: body.correlationId,
        fieldUpdates: body.fieldUpdates,
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      };
      result = await this.service.correct(serviceInput);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!result.accepted) throwReceiptProblem(result.code);
    return result.value as unknown as Record<string, unknown>;
  }

  @Get('candidates/:candidateId')
  @HttpCode(HttpStatus.OK)
  public async readCandidate(
    @Req() request: unknown,
    @Param('candidateId') candidateId: string,
    @Query() query: ReceiptCandidateReadQueryDto,
  ): Promise<Record<string, unknown>> {
    this.rejectClientAuthority(query, request);
    if (
      !isStableIdentifier(candidateId) ||
      !isRecord(query) ||
      !isStableIdentifier(query.artifactVersionId)
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    let authorization: Awaited<ReturnType<ReceiptMutationAuthorizationPortV1['authorize']>>;
    try {
      authorization = await this.mutationAuthorization.authorize({
        context,
        action: 'RECEIPT_CORRECT',
        artifactVersionId: query.artifactVersionId,
        candidateId,
      });
    } catch {
      throwReceiptProblem('AUTHORIZATION_UNAVAILABLE');
    }
    if (!authorization.accepted) {
      throwReceiptProblem(
        authorization.code === 'FORBIDDEN' ? 'AUTHORIZATION_DENIED' : 'AUTHORIZATION_UNAVAILABLE',
      );
    }

    let candidate: Awaited<ReturnType<ReceiptExtractionCommandRepositoryPortV1['findCandidate']>>;
    try {
      candidate = await this.commands.findCandidate({
        tenantScope: context.tenantScope,
        candidateId,
        artifactVersionId: query.artifactVersionId,
      });
    } catch {
      throwReceiptProblem('COMMAND_REPOSITORY_UNAVAILABLE');
    }
    if (candidate === undefined) throwReceiptProblem('CANDIDATE_NOT_FOUND');
    return candidate as unknown as Record<string, unknown>;
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

  private isValidationRecord(value: ReceiptValidationInput): boolean {
    if (
      !isNonEmptyText(value.merchant) ||
      !isNonEmptyText(value.transactionDateTime) ||
      !isNonEmptyText(value.currency) ||
      !isNonEmptyText(value.subtotal) ||
      !isNonEmptyText(value.tax) ||
      !isNonEmptyText(value.total) ||
      !isRecord(value.fieldConfidence)
    )
      return false;
    if (
      Object.keys(value.fieldConfidence).length > 64 ||
      Object.values(value.fieldConfidence).some(
        (confidence) => !Number.isInteger(confidence) || confidence < 0 || confidence > 100,
      )
    )
      return false;
    if (
      value.lineItems !== undefined &&
      (!Array.isArray(value.lineItems) ||
        value.lineItems.length > 256 ||
        value.lineItems.some(
          (item) =>
            !isRecord(item) ||
            !isNonEmptyText(item['description']) ||
            !isNonEmptyText(item['amount']),
        ))
    )
      return false;
    return true;
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
