import { randomUUID } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type StrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';
import {
  type IaeAuthorizationFailureCodeV1,
  type IaeAuthorizationPortV1,
} from './iae-authorization.port.js';

export type IaeOriginalViewActionV1 = 'OPEN_CLOUD' | 'OPEN_ON_SOURCE_DEVICE' | 'SOURCE_OFFLINE';

export interface IaeOriginalViewDescriptorV1 {
  readonly schemaVersion: 1;
  readonly descriptorId: StableIdentifierV1;
  readonly artifactVersionId: StableIdentifierV1;
  readonly evidenceId?: StableIdentifierV1;
  readonly tenantScope: IamTenantContextV1['tenantScope'];
  readonly action: IaeOriginalViewActionV1;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly authorizationEpoch: number;
  /** Cloud-only, signed, short-lived descriptor. It is never a local path or storage key. */
  readonly signedDescriptor?: string;
}

export type IaeOriginalViewErrorCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_TTL'
  | 'AUTHENTICATION_REQUIRED'
  | 'TENANT_SCOPE_MISMATCH'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_REVOKED'
  | 'MEMBERSHIP_INACTIVE'
  | 'PERMISSION_DENIED'
  | 'ARTIFACT_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'ARTIFACT_UNAVAILABLE'
  | 'SOURCE_OFFLINE'
  | 'CLOUD_SIGNING_UNAVAILABLE'
  | 'CLOUD_SIGNING_REJECTED'
  | 'INVALID_SIGNED_DESCRIPTOR';

export type IaeOriginalViewResultV1 =
  | { readonly accepted: true; readonly value: IaeOriginalViewDescriptorV1 }
  | { readonly accepted: false; readonly code: IaeOriginalViewErrorCodeV1 };

export interface CloudOriginalSigningInputV1 {
  readonly tenantScope: IamTenantContextV1['tenantScope'];
  readonly artifactVersionId: StableIdentifierV1;
  readonly evidenceId?: StableIdentifierV1;
  /** Internal IAE reference; never returned by this public port. */
  readonly placementReference: string;
  readonly issuedAt: StrictUtcTimestampV1;
  readonly expiresAt: StrictUtcTimestampV1;
  readonly disposition: 'ORIGINAL';
}

export type CloudOriginalSignerResultV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly signedDescriptor: string;
        readonly expiresAt: StrictUtcTimestampV1;
      };
    }
  | { readonly accepted: false; readonly code: 'SIGNING_UNAVAILABLE' | 'SIGNING_REJECTED' };

export const IAE_CLOUD_ORIGINAL_SIGNER_PORT = Symbol('IAE_CLOUD_ORIGINAL_SIGNER_PORT');
export interface CloudOriginalSignerPortV1 {
  sign(input: CloudOriginalSigningInputV1): Promise<CloudOriginalSignerResultV1>;
}

export const IAE_ORIGINAL_VIEW_PORT = Symbol('IAE_ORIGINAL_VIEW_PORT');
export interface IaeOriginalViewPortV1 {
  resolveOriginalView(
    context: IamTenantContextV1,
    input: {
      readonly artifactVersionId: unknown;
      readonly evidenceId?: unknown;
      readonly now: unknown;
      readonly ttlSeconds?: unknown;
    },
  ): Promise<IaeOriginalViewResultV1>;
}

function authorizationCode(code: IaeAuthorizationFailureCodeV1): IaeOriginalViewErrorCodeV1 {
  return code;
}

function safeSignedDescriptor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\p{Cc}]/u.test(value) &&
    !/^file:/iu.test(value) &&
    !/^[a-z]:[\\/]/iu.test(value) &&
    !value.startsWith('\\\\')
  );
}

function stableDescriptorId(): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(randomUUID());
  if (!parsed.accepted) throw new Error('IAE_DESCRIPTOR_ID_GENERATION_FAILED');
  return parsed.value;
}

function expiresAt(
  issuedAt: StrictUtcTimestampV1,
  ttlSecondsInput: unknown,
): StrictUtcTimestampV1 | undefined {
  const ttlSeconds = ttlSecondsInput === undefined ? 300 : ttlSecondsInput;
  if (
    typeof ttlSeconds !== 'number' ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 300
  )
    return undefined;
  const value = parseStrictUtcTimestampV1(
    new Date(Date.parse(issuedAt) + ttlSeconds * 1000).toISOString(),
  );
  return value.accepted ? value.value : undefined;
}

function parseNow(input: unknown): StrictUtcTimestampV1 | undefined {
  const parsed = parseStrictUtcTimestampV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

/** IAE-owned resolver for safe original views; DDA and clients consume this port only. */
export class IaeOriginalViewService implements IaeOriginalViewPortV1 {
  public constructor(
    private readonly artifacts: ArtifactRepositoryPortV1,
    private readonly authorization: IaeAuthorizationPortV1,
    private readonly cloudSigner: CloudOriginalSignerPortV1,
  ) {}

  public async resolveOriginalView(
    context: IamTenantContextV1,
    input: {
      readonly artifactVersionId: unknown;
      readonly evidenceId?: unknown;
      readonly now: unknown;
      readonly ttlSeconds?: unknown;
    },
  ): Promise<IaeOriginalViewResultV1> {
    if (!context || !parseStableIdentifierV1(context.actorId).accepted)
      return Object.freeze({ accepted: false, code: 'AUTHENTICATION_REQUIRED' as const });
    const artifactVersionId = parseStableIdentifierV1(input.artifactVersionId);
    const evidenceId =
      input.evidenceId === undefined ? undefined : parseStableIdentifierV1(input.evidenceId);
    const issuedAt = parseNow(input.now);
    if (!artifactVersionId.accepted || (evidenceId && !evidenceId.accepted))
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    if (!issuedAt) return Object.freeze({ accepted: false, code: 'INVALID_TIMESTAMP' as const });
    const expiry = expiresAt(issuedAt, input.ttlSeconds);
    if (!expiry) return Object.freeze({ accepted: false, code: 'INVALID_TTL' as const });

    const readable = await this.authorization.authorize(context, {
      tenantScope: context.tenantScope,
      action: 'ARTIFACT_RECORD_READ',
      now: issuedAt,
    });
    if (!readable.accepted)
      return Object.freeze({ accepted: false, code: authorizationCode(readable.code) });

    const source = await this.artifacts.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, artifactVersionId.value);
      if (!version) return undefined;
      if (!tenantScopesEqualV1(version.tenantScope, context.tenantScope))
        return { mismatch: true as const };
      const placements = (await transaction.listPlacements(context, version.versionId)).filter(
        (placement) => tenantScopesEqualV1(placement.tenantScope, version.tenantScope),
      );
      const evidence = evidenceId
        ? (await transaction.listEvidence(context, version.versionId)).find(
            (candidate) =>
              candidate.evidenceId === evidenceId.value &&
              tenantScopesEqualV1(candidate.tenantScope, version.tenantScope),
          )
        : undefined;
      if (evidenceId && !evidence) return { evidenceMissing: true as const };
      return { version, placements, evidence };
    });
    if (!source) return Object.freeze({ accepted: false, code: 'ARTIFACT_NOT_FOUND' as const });
    if ('mismatch' in source)
      return Object.freeze({ accepted: false, code: 'TENANT_SCOPE_MISMATCH' as const });
    if ('evidenceMissing' in source)
      return Object.freeze({ accepted: false, code: 'EVIDENCE_NOT_FOUND' as const });
    if (source.version.status === 'DELETED')
      return Object.freeze({ accepted: false, code: 'ARTIFACT_UNAVAILABLE' as const });
    if (source.version.status !== 'ACTIVE')
      return Object.freeze({ accepted: false, code: 'ARTIFACT_UNAVAILABLE' as const });
    if (source.evidence?.sourceState === 'DELETED')
      return Object.freeze({ accepted: false, code: 'ARTIFACT_UNAVAILABLE' as const });
    if (source.evidence?.sourceState === 'SOURCE_OFFLINE')
      return Object.freeze({ accepted: false, code: 'SOURCE_OFFLINE' as const });

    const local = source.placements.find(
      (placement) => placement.kind === 'LOCAL' && placement.available,
    );
    const cloud = source.placements.find(
      (placement) => placement.kind === 'CLOUD' && placement.available,
    );
    if (source.version.dataMode === 'Local' || (!cloud && local)) {
      if (!local) return Object.freeze({ accepted: false, code: 'SOURCE_OFFLINE' as const });
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          schemaVersion: 1 as const,
          descriptorId: stableDescriptorId(),
          artifactVersionId: artifactVersionId.value,
          ...(evidenceId ? { evidenceId: evidenceId.value } : {}),
          tenantScope: context.tenantScope,
          action: 'OPEN_ON_SOURCE_DEVICE' as const,
          issuedAt,
          expiresAt: expiry,
          authorizationEpoch: context.authorizationEpoch,
        }),
      });
    }
    if (!cloud) return Object.freeze({ accepted: false, code: 'ARTIFACT_UNAVAILABLE' as const });
    if (source.version.scanState !== 'CLEAN')
      return Object.freeze({ accepted: false, code: 'ARTIFACT_UNAVAILABLE' as const });

    const original = await this.authorization.authorize(context, {
      tenantScope: context.tenantScope,
      action: 'ARTIFACT_ORIGINAL_DOWNLOAD',
      now: issuedAt,
    });
    if (!original.accepted)
      return Object.freeze({ accepted: false, code: authorizationCode(original.code) });
    const signed = await this.cloudSigner.sign({
      tenantScope: context.tenantScope,
      artifactVersionId: artifactVersionId.value,
      ...(evidenceId ? { evidenceId: evidenceId.value } : {}),
      placementReference: cloud.opaqueReference,
      issuedAt,
      expiresAt: expiry,
      disposition: 'ORIGINAL',
    });
    if (!signed.accepted)
      return Object.freeze({
        accepted: false,
        code:
          signed.code === 'SIGNING_UNAVAILABLE'
            ? ('CLOUD_SIGNING_UNAVAILABLE' as const)
            : ('CLOUD_SIGNING_REJECTED' as const),
      });
    const signedExpiry = parseNow(signed.value.expiresAt);
    if (
      !safeSignedDescriptor(signed.value.signedDescriptor) ||
      !signedExpiry ||
      Date.parse(signedExpiry) <= Date.parse(issuedAt) ||
      Date.parse(signedExpiry) > Date.parse(expiry)
    )
      return Object.freeze({ accepted: false, code: 'INVALID_SIGNED_DESCRIPTOR' as const });
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        schemaVersion: 1 as const,
        descriptorId: stableDescriptorId(),
        artifactVersionId: artifactVersionId.value,
        ...(evidenceId ? { evidenceId: evidenceId.value } : {}),
        tenantScope: context.tenantScope,
        action: 'OPEN_CLOUD' as const,
        issuedAt,
        expiresAt: signedExpiry,
        authorizationEpoch: context.authorizationEpoch,
        signedDescriptor: signed.value.signedDescriptor,
      }),
    });
  }
}
