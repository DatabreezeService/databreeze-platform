import type { ArtifactDeletionRequestV1 } from '@databreeze/domain/artifact-retention/v1';
import type { EvidenceAccessGrantV1 } from '@databreeze/domain/evidence-grant/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';
import type { ArtifactRetentionRepositoryPortV1 } from './artifact-retention-repository.port.js';
import type { EvidenceGrantRepositoryPortV1 } from './evidence-grant-repository.port.js';
import { EvidenceGrantService } from './evidence-grant.service.js';
import {
  type IaeAuthorizationPortV1,
  type IaeAuthorizationActionV1,
} from './iae-authorization.port.js';
import { ArtifactRetentionService } from './artifact-retention.service.js';

export type IaeAuthorizedAccessErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_UNAVAILABLE'
  | 'EVIDENCE_NOT_FOUND'
  | 'GRANT_NOT_FOUND'
  | 'REQUEST_NOT_FOUND'
  | 'TENANT_SCOPE_MISMATCH'
  | 'AUTHENTICATION_REQUIRED'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_REVOKED'
  | 'MEMBERSHIP_INACTIVE'
  | 'PERMISSION_DENIED'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'DEVICE_MISMATCH'
  | 'EPOCH_MISMATCH'
  | 'RETENTION_BLOCKED'
  | 'MFA_REQUIRED'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_STATE'
  | 'INVALID_REVISION'
  | 'CROSS_SCOPE';

export type IaeAuthorizedAccessResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IaeAuthorizedAccessErrorCodeV1 };

export const IAE_AUTHORIZED_ARTIFACT_ACCESS_PORT = Symbol('IAE_AUTHORIZED_ARTIFACT_ACCESS_PORT');
export interface IaeAuthorizedArtifactAccessPortV1 {
  requireArtifactVersion(
    context: IamTenantContextV1,
    input: { readonly artifactVersionId: unknown; readonly action?: IaeAuthorizationActionV1 },
  ): Promise<IaeAuthorizedAccessResultV1<true>>;
  requireEvidenceReference(
    context: IamTenantContextV1,
    input: {
      readonly artifactVersionId: unknown;
      readonly evidenceId: unknown;
      readonly action?: IaeAuthorizationActionV1;
      readonly now?: string;
    },
  ): Promise<IaeAuthorizedAccessResultV1<true>>;
  issueEvidenceGrant(
    context: IamTenantContextV1,
    input: Parameters<EvidenceGrantService['issueForEvidence']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<EvidenceAccessGrantV1>>;
  revokeEvidenceGrant(
    context: IamTenantContextV1,
    grantId: unknown,
  ): Promise<IaeAuthorizedAccessResultV1<true>>;
  resolveEvidenceGrant(
    context: IamTenantContextV1,
    input: Parameters<EvidenceGrantService['resolve']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<EvidenceAccessGrantV1>>;
  requestRetention(
    context: IamTenantContextV1,
    input: Parameters<ArtifactRetentionService['request']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<ArtifactDeletionRequestV1>>;
  authorizeRetention(
    context: IamTenantContextV1,
    input: Parameters<ArtifactRetentionService['authorize']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<ArtifactDeletionRequestV1>>;
}

function authCode(code: string): IaeAuthorizedAccessErrorCodeV1 {
  return code as IaeAuthorizedAccessErrorCodeV1;
}

function id(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

/**
 * Public IAE application facade. It is the only feature-facing path for evidence grants and
 * retention operations; the lower-level services remain useful for IAE HTTP controllers.
 */
export class AuthorizedArtifactAccessService implements IaeAuthorizedArtifactAccessPortV1 {
  private readonly evidence: EvidenceGrantService;
  private readonly retention: ArtifactRetentionService;

  public constructor(
    private readonly artifacts: ArtifactRepositoryPortV1,
    private readonly grants: EvidenceGrantRepositoryPortV1,
    private readonly retentionRequests: ArtifactRetentionRepositoryPortV1,
    private readonly authorization: IaeAuthorizationPortV1,
  ) {
    this.evidence = new EvidenceGrantService(grants, artifacts);
    this.retention = new ArtifactRetentionService(retentionRequests, artifacts);
  }

  private async authorize(
    context: IamTenantContextV1,
    tenantScope: IamTenantContextV1['tenantScope'],
    action: IaeAuthorizationActionV1,
    now?: string,
  ): Promise<IaeAuthorizedAccessResultV1<true>> {
    if (!context || typeof context.actorId !== 'string' || context.actorId.length === 0)
      return { accepted: false, code: 'AUTHENTICATION_REQUIRED' };
    if (!tenantScopesEqualV1(context.tenantScope, tenantScope))
      return { accepted: false, code: 'TENANT_SCOPE_MISMATCH' };
    const request = now === undefined ? { tenantScope, action } : { tenantScope, action, now };
    const result = await this.authorization.authorize(context, request);
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }

  private authenticated(context: IamTenantContextV1): IaeAuthorizedAccessResultV1<true> {
    return context && id(context.actorId)
      ? { accepted: true, value: true }
      : { accepted: false, code: 'AUTHENTICATION_REQUIRED' };
  }

  public async requireArtifactVersion(
    context: IamTenantContextV1,
    input: { readonly artifactVersionId: unknown; readonly action?: IaeAuthorizationActionV1 },
  ): Promise<IaeAuthorizedAccessResultV1<true>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const artifactVersionId = id(input.artifactVersionId);
    if (!artifactVersionId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const version = await this.artifacts.findVersion(context, artifactVersionId);
    if (!version) return { accepted: false, code: 'ARTIFACT_NOT_FOUND' };
    if (!tenantScopesEqualV1(version.tenantScope, context.tenantScope))
      return { accepted: false, code: 'TENANT_SCOPE_MISMATCH' };
    if (version.status === 'DELETED') return { accepted: false, code: 'ARTIFACT_UNAVAILABLE' };
    return this.authorize(context, version.tenantScope, input.action ?? 'ARTIFACT_RECORD_READ');
  }

  public async requireEvidenceReference(
    context: IamTenantContextV1,
    input: {
      readonly artifactVersionId: unknown;
      readonly evidenceId: unknown;
      readonly action?: IaeAuthorizationActionV1;
      readonly now?: string;
    },
  ): Promise<IaeAuthorizedAccessResultV1<true>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const versionId = id(input.artifactVersionId);
    const evidenceId = id(input.evidenceId);
    if (!versionId || !evidenceId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const version = await this.artifacts.findVersion(context, versionId);
    if (!version) return { accepted: false, code: 'ARTIFACT_NOT_FOUND' };
    if (!tenantScopesEqualV1(version.tenantScope, context.tenantScope))
      return { accepted: false, code: 'TENANT_SCOPE_MISMATCH' };
    if (version.status === 'DELETED') return { accepted: false, code: 'ARTIFACT_UNAVAILABLE' };
    const evidence = await this.artifacts.withTransaction(context, async (transaction) =>
      (await transaction.listEvidence(context, versionId)).find(
        (candidate) =>
          candidate.evidenceId === evidenceId &&
          candidate.artifactVersionId === versionId &&
          tenantScopesEqualV1(candidate.tenantScope, version.tenantScope),
      ),
    );
    if (!evidence) return { accepted: false, code: 'EVIDENCE_NOT_FOUND' };
    if (evidence.sourceState === 'DELETED')
      return { accepted: false, code: 'ARTIFACT_UNAVAILABLE' };
    return this.authorize(
      context,
      version.tenantScope,
      input.action ?? 'ARTIFACT_RECORD_READ',
      input.now,
    );
  }

  public async issueEvidenceGrant(
    context: IamTenantContextV1,
    input: Parameters<EvidenceGrantService['issueForEvidence']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<EvidenceAccessGrantV1>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const versionId = id(input.versionId);
    const evidenceId = id(input.evidenceId);
    if (!versionId || !evidenceId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const authorized = await this.requireEvidenceReference(context, {
      artifactVersionId: versionId,
      evidenceId,
      ...(typeof input.issuedAt === 'string' ? { now: input.issuedAt } : {}),
    });
    if (!authorized.accepted) return authorized;
    const result = await this.evidence.issueForEvidence(context, {
      ...input,
      versionId,
      evidenceId,
    });
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }

  public async revokeEvidenceGrant(
    context: IamTenantContextV1,
    grantIdInput: unknown,
  ): Promise<IaeAuthorizedAccessResultV1<true>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const grantId = id(grantIdInput);
    if (!grantId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const grant = await this.grants.find(context, grantId);
    if (!grant) return { accepted: false, code: 'GRANT_NOT_FOUND' };
    const binding = await this.artifacts.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, grant.artifactVersionId);
      if (!version || !tenantScopesEqualV1(version.tenantScope, grant.tenantScope)) return false;
      const evidence = (await transaction.listEvidence(context, grant.artifactVersionId)).find(
        (candidate) =>
          candidate.evidenceId === grant.evidenceId &&
          candidate.artifactVersionId === grant.artifactVersionId &&
          tenantScopesEqualV1(candidate.tenantScope, grant.tenantScope),
      );
      return evidence !== undefined;
    });
    if (!binding) return { accepted: false, code: 'EVIDENCE_NOT_FOUND' };
    const authorized = await this.authorize(
      context,
      grant.tenantScope,
      'ARTIFACT_RECORD_READ',
      new Date().toISOString(),
    );
    if (!authorized.accepted) return authorized;
    const result = await this.evidence.revoke(context, grantId);
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }

  public async resolveEvidenceGrant(
    context: IamTenantContextV1,
    input: Parameters<EvidenceGrantService['resolve']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<EvidenceAccessGrantV1>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const grantId = id(input.grantId);
    if (!grantId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const grant = await this.grants.find(context, grantId);
    if (!grant) return { accepted: false, code: 'GRANT_NOT_FOUND' };
    if (!tenantScopesEqualV1(grant.tenantScope, context.tenantScope))
      return { accepted: false, code: 'TENANT_SCOPE_MISMATCH' };
    const artifactState = await this.artifacts.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, grant.artifactVersionId);
      if (!version || !tenantScopesEqualV1(version.tenantScope, grant.tenantScope))
        return undefined;
      const evidence = (await transaction.listEvidence(context, grant.artifactVersionId)).find(
        (candidate) =>
          candidate.evidenceId === grant.evidenceId &&
          tenantScopesEqualV1(candidate.tenantScope, grant.tenantScope),
      );
      return { version, evidence };
    });
    if (!artifactState?.evidence) return { accepted: false, code: 'EVIDENCE_NOT_FOUND' };
    if (
      artifactState.version.status !== 'ACTIVE' ||
      artifactState.evidence.sourceState === 'DELETED'
    )
      return { accepted: false, code: 'GRANT_REVOKED' };
    const authorized = await this.authorize(
      context,
      grant.tenantScope,
      'ARTIFACT_RECORD_READ',
      typeof input.now === 'string' ? input.now : undefined,
    );
    if (!authorized.accepted) return authorized;
    const result = await this.evidence.resolve(context, input);
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }

  public async requestRetention(
    context: IamTenantContextV1,
    input: Parameters<ArtifactRetentionService['request']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<ArtifactDeletionRequestV1>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const versionId = id(input.artifactVersionId);
    if (!versionId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const version = await this.artifacts.findVersion(context, versionId);
    if (!version) return { accepted: false, code: 'ARTIFACT_NOT_FOUND' };
    if (!tenantScopesEqualV1(version.tenantScope, context.tenantScope))
      return { accepted: false, code: 'TENANT_SCOPE_MISMATCH' };
    if (version.status === 'DELETED') return { accepted: false, code: 'ARTIFACT_UNAVAILABLE' };
    const authorized = await this.authorize(
      context,
      version.tenantScope,
      'RETENTION_MANAGE',
      typeof input.requestedAt === 'string' ? input.requestedAt : undefined,
    );
    if (!authorized.accepted) return authorized;
    const result = await this.retention.request(context, {
      ...input,
      artifactVersionId: versionId,
      tenantScope: context.tenantScope,
      requestedBy: context.actorId,
    });
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }

  public async authorizeRetention(
    context: IamTenantContextV1,
    input: Parameters<ArtifactRetentionService['authorize']>[1],
  ): Promise<IaeAuthorizedAccessResultV1<ArtifactDeletionRequestV1>> {
    const authenticated = this.authenticated(context);
    if (!authenticated.accepted) return authenticated;
    const requestId = id(input.requestId);
    if (!requestId) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const current = await this.retention.find(context, requestId);
    if (!current.accepted) return { accepted: false, code: authCode(current.code) };
    const authorized = await this.authorize(
      context,
      current.value.tenantScope,
      'RETENTION_MANAGE',
      typeof input.approvedAt === 'string' ? input.approvedAt : undefined,
    );
    if (!authorized.accepted) return authorized;
    const result = await this.retention.authorize(context, input);
    return result.accepted ? result : { accepted: false, code: authCode(result.code) };
  }
}
