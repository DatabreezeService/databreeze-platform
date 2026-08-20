import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  parseV3Contract,
  type DdaWorkspaceMemberSettings,
  type MemberSettingsMember,
} from '@databreeze/contracts/v3';
import {
  defaultAgentGrantLevelForPresetV1,
  PERMISSIONS_V1,
  roleHasPermissionV1,
} from '@databreeze/domain/permissions/v1';
import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  IAM_ACCESS_PRESET_SERVICE,
  AccessPresetService,
} from '../application/access-preset.service.js';
import {
  IAM_AGENT_GRANT_SERVICE,
  type AgentGrantService,
} from '../application/agent-grant.service.js';
import {
  IAM_MEMBERSHIP_SERVICE,
  type IamMembershipService,
} from '../application/membership.service.js';
import { selectAuthoritativeMembership } from '../application/membership-authority.js';
import {
  REQUEST_TENANT_CONTEXT,
  RequestTenantContextProblemError,
  UnavailableRequestTenantContextAdapter,
  type RequestTenantContextPortV1,
} from '../../../platform/http/request-tenant-context.port.js';

function http(status: number): never {
  throw new HttpException(`HTTP_${status}`, status);
}

const AUTHORITY_FIELDS = new Set([
  'tenantScope',
  'organizationId',
  'workspaceId',
  'projectId',
  'actorId',
  'memberAuthorized',
  'role',
  'authorized',
  'authorization',
]);
const SETTINGS_SCHEMA_ID =
  'https://schemas.databreeze.dev/contracts/v3/dda-workspace-member-settings' as const;

function hasClientAuthority(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) => AUTHORITY_FIELDS.has(key) || hasClientAuthority(child, seen),
  );
}

function rejectClientAuthority(request: unknown, ...clientInputs: readonly unknown[]): void {
  const requestRecord =
    typeof request === 'object' && request !== null && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : undefined;
  if (
    hasClientAuthority(requestRecord?.['body']) ||
    hasClientAuthority(requestRecord?.['query']) ||
    hasClientAuthority(requestRecord?.['params']) ||
    clientInputs.some((value) => hasClientAuthority(value)) ||
    (requestRecord !== undefined &&
      [...AUTHORITY_FIELDS].some((field) => Object.hasOwn(requestRecord, field)))
  ) {
    http(HttpStatus.BAD_REQUEST);
  }
}

function mapContextError(error: unknown): never {
  if (error instanceof RequestTenantContextProblemError) {
    if (error.code === 'CONTEXT_INVALID') http(HttpStatus.BAD_REQUEST);
    if (error.code === 'AUTHENTICATION_FAILED') throw new UnauthorizedException('HTTP_401');
    throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
  }
  throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
}

function mapApplicationCode(code: string): never {
  if (code === 'SCOPE_DENIED') throw new ForbiddenException('HTTP_403');
  if (code === 'NOT_FOUND') http(HttpStatus.NOT_FOUND);
  throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
}

function displayNameForMembership(value: unknown, principalId: string): string {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 160 &&
    value.trim() === value &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    }) &&
    !/(?:https?:\/\/|\\\\|\b(?:password|secret|credential|token)\b)/iu.test(value)
  )
    return value;
  return principalId;
}

/** IAM-024/IAM-025: server-owned member/settings projection; no DDA persistence access. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('v3/workspaces/settings')
export class WorkspaceSettingsController {
  private readonly requestContext: RequestTenantContextPortV1;
  private readonly memberships: IamMembershipService | undefined;
  private readonly grants: AgentGrantService | undefined;
  private readonly accessPresets: AccessPresetService;

  public constructor(
    @Optional()
    @Inject(IAM_MEMBERSHIP_SERVICE)
    memberships?: IamMembershipService,
    @Optional()
    @Inject(IAM_AGENT_GRANT_SERVICE)
    grants?: AgentGrantService,
    @Optional()
    @Inject(REQUEST_TENANT_CONTEXT)
    requestContext?: RequestTenantContextPortV1,
    @Optional()
    @Inject(IAM_ACCESS_PRESET_SERVICE)
    accessPresets?: AccessPresetService,
  ) {
    this.memberships = memberships;
    this.grants = grants;
    this.requestContext = requestContext ?? new UnavailableRequestTenantContextAdapter();
    this.accessPresets = accessPresets ?? new AccessPresetService();
  }

  @Get()
  @ApiOperation({ summary: 'Read the authorized workspace member and agent settings projection' })
  @ApiOkResponse({
    description: 'Server-authorized member settings projection.',
    schema: { $ref: '#/components/schemas/DdaWorkspaceMemberSettings' },
  })
  @ApiForbiddenResponse({ description: 'The actor lacks workspace settings read permission.' })
  @ApiServiceUnavailableResponse({ description: 'IAM or agent-grant persistence is unavailable.' })
  async getSettings(
    @Req() request: unknown,
    @Query() query?: Record<string, unknown>,
  ): Promise<DdaWorkspaceMemberSettings> {
    rejectClientAuthority(request, query);
    let context;
    try {
      context = await this.requestContext.resolve(request);
    } catch (error) {
      return mapContextError(error);
    }
    const tenantScope = context.tenantScope;
    if (tenantScope.scopeType !== 'workspace' || tenantScope.workspaceId === undefined)
      throw new ForbiddenException('HTTP_403');
    if (this.memberships === undefined || this.grants === undefined)
      throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);

    let membershipResult;
    try {
      membershipResult = await this.memberships.list(context);
    } catch {
      throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!membershipResult.accepted) return mapApplicationCode(membershipResult.code);
    const governingMemberships = membershipResult.value.filter(
      (membership) =>
        membership.status === 'ACTIVE' && tenantScopeContainsV1(membership.scope, tenantScope),
    );
    if (governingMemberships.length > 10_000)
      throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    const effectiveMemberships = new Map<string, (typeof governingMemberships)[number]>();
    for (const membership of governingMemberships) {
      const authoritative = selectAuthoritativeMembership(
        governingMemberships,
        context,
        membership.principalId,
      );
      if (authoritative !== undefined)
        effectiveMemberships.set(authoritative.principalId, authoritative);
    }
    const workspaceMembers = [...effectiveMemberships.values()];
    const actorMembership = selectAuthoritativeMembership(
      governingMemberships,
      context,
      context.actorId,
    );
    if (
      actorMembership === undefined ||
      !roleHasPermissionV1(actorMembership.roleId, PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE)
    )
      throw new ForbiddenException('HTTP_403');
    const members: MemberSettingsMember[] = [];
    for (const membership of [...workspaceMembers].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const preset = this.accessPresets.presetForRoleId(membership.roleId);
      if (preset === undefined) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
      const grant =
        membership.scope.scopeType === 'organization'
          ? {
              accepted: true as const,
              value: {
                level: defaultAgentGrantLevelForPresetV1(preset),
                revision: 0,
              },
            }
          : await this.grants
              .getEffectiveGrantProjection(context, { memberId: membership.id })
              .catch(() => undefined);
      if (grant === undefined) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
      if (!grant.accepted) return mapApplicationCode(grant.code);
      if (preset === 'VIEWER' && !['NONE', 'ANALYZE'].includes(grant.value.level)) {
        throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
      }
      const memberProjection: MemberSettingsMember =
        preset === 'VIEWER'
          ? {
              memberId: membership.id,
              displayName: displayNameForMembership(
                (membership as unknown as Record<string, unknown>)['displayName'],
                membership.principalId,
              ),
              accessPreset: 'VIEWER' as const,
              agentGrantLevel: grant.value.level as 'NONE' | 'ANALYZE',
              agentGrantRevision: grant.value.revision,
              membershipRevision: membership.revision,
            }
          : {
              memberId: membership.id,
              displayName: displayNameForMembership(
                (membership as unknown as Record<string, unknown>)['displayName'],
                membership.principalId,
              ),
              accessPreset: preset,
              agentGrantLevel: grant.value.level,
              agentGrantRevision: grant.value.revision,
              membershipRevision: membership.revision,
            };
      members.push(memberProjection);
    }
    const projection = Object.freeze({
      schemaVersion: 3 as const,
      workspaceId: tenantScope.workspaceId,
      canManage: roleHasPermissionV1(
        actorMembership.roleId,
        PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE,
      ),
      members: Object.freeze(members),
    });
    const parsed = parseV3Contract<DdaWorkspaceMemberSettings>(SETTINGS_SCHEMA_ID, projection);
    if (!parsed.accepted) throw new HttpException('HTTP_503', HttpStatus.SERVICE_UNAVAILABLE);
    return Object.freeze(parsed.value);
  }
}
