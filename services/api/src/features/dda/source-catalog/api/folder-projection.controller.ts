import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
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
  FOLDER_PROJECTION_AUTHORIZATION_PORT,
  UnavailableFolderProjectionAuthorizationAdapter,
  type FolderProjectionAuthorizationPortV1,
} from '../application/folder-projection-authorization.port.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../../platform/http/request-tenant-context.port.js';

export type FolderProjectionDataModeV1 = 'LOCAL' | 'CLOUD' | 'HYBRID';

export type FolderProjectionConsentProblemCodeV1 =
  | 'LOCAL_MODE_DENIED'
  | 'CONSENT_REQUIRED'
  | 'PROJECTION_CANCELLED'
  | 'UNAUTHORIZED';

/** Client fields are intent and resource references only; policy fields are server-owned. */
export interface FolderProjectionConsentDtoV1 {
  readonly bindingId: string;
  readonly sourceId: string;
  readonly dataMode: FolderProjectionDataModeV1;
  readonly consentGranted: boolean;
  readonly projectionCancelled?: boolean;
}

export interface FolderProjectionConsentEvaluationInputV1 extends FolderProjectionConsentDtoV1 {
  /** Supplied by FolderProjectionAuthorizationPortV1, never by HTTP input. */
  readonly serverContentAllowed: boolean;
}

export type FolderProjectionConsentResultV1 =
  | {
      readonly accepted: true;
      readonly bindingId: string;
      readonly sourceId: string;
      readonly transferAllowed: true;
    }
  | {
      readonly accepted: false;
      readonly code: FolderProjectionConsentProblemCodeV1;
    };

/** DSO-015/021: cloud receives only consented metadata/content; LOCAL never uploads originals. */
export function evaluateFolderProjectionConsent(
  input: FolderProjectionConsentEvaluationInputV1,
): FolderProjectionConsentResultV1 {
  if (input.projectionCancelled === true) {
    return Object.freeze({ accepted: false, code: 'PROJECTION_CANCELLED' });
  }
  if (input.dataMode === 'LOCAL') {
    return Object.freeze({ accepted: false, code: 'LOCAL_MODE_DENIED' });
  }
  if (!input.consentGranted || !input.serverContentAllowed) {
    return Object.freeze({ accepted: false, code: 'CONSENT_REQUIRED' });
  }
  return Object.freeze({
    accepted: true,
    bindingId: input.bindingId,
    sourceId: input.sourceId,
    transferAllowed: true as const,
  });
}

function hasClientAuthorityField(value: unknown, depth = 0): boolean {
  const fields = new Set([
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
    'contentAllowed',
    'authorization',
    'authorized',
    'role',
  ]);
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => hasClientAuthorityField(item, depth + 1));
  return Object.entries(value).some(
    ([key, child]) => fields.has(key) || hasClientAuthorityField(child, depth + 1),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableIdentifier(value: unknown): value is string {
  return parseStableIdentifierV1(value).accepted;
}

function isDataMode(value: unknown): value is FolderProjectionDataModeV1 {
  return value === 'LOCAL' || value === 'CLOUD' || value === 'HYBRID';
}

@ApiTags('dda')
@ApiBearerAuth()
@Controller('v1/dda/folder-projections')
export class FolderProjectionController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly authorization: FolderProjectionAuthorizationPortV1;

  public constructor(
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(FOLDER_PROJECTION_AUTHORIZATION_PORT)
    authorization?: FolderProjectionAuthorizationPortV1,
  ) {
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.authorization = authorization ?? new UnavailableFolderProjectionAuthorizationAdapter();
  }

  @Post('consent')
  @HttpCode(HttpStatus.OK)
  public async consent(
    @Req() request: unknown,
    @Body() dto: FolderProjectionConsentDtoV1,
  ): Promise<FolderProjectionConsentResultV1> {
    this.rejectClientAuthority(dto, request);
    if (
      !isRecord(dto) ||
      !isStableIdentifier(dto.bindingId) ||
      !isStableIdentifier(dto.sourceId) ||
      !isDataMode(dto.dataMode) ||
      typeof dto.consentGranted !== 'boolean' ||
      (dto.projectionCancelled !== undefined && typeof dto.projectionCancelled !== 'boolean')
    ) {
      throw new BadRequestException();
    }
    const context = await this.resolveContext(request);
    let decision: Awaited<ReturnType<FolderProjectionAuthorizationPortV1['authorize']>>;
    try {
      decision = await this.authorization.authorize({
        context,
        bindingId: dto.bindingId,
        sourceId: dto.sourceId,
        requestedDataMode: dto.dataMode,
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!decision.accepted) {
      if (decision.code === 'POLICY_UNAVAILABLE') throw new ServiceUnavailableException();
      throw new ForbiddenException();
    }
    const result = evaluateFolderProjectionConsent({
      ...dto,
      dataMode: decision.dataMode,
      serverContentAllowed: decision.contentAllowed,
    });
    if (!result.accepted) {
      if (result.code === 'PROJECTION_CANCELLED' || result.code === 'CONSENT_REQUIRED') {
        throw new ForbiddenException();
      }
      throw new ForbiddenException();
    }
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
