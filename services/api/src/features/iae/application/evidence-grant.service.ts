import {
  createEvidenceAccessGrantV1,
  type EvidenceAccessGrantV1,
  type EvidenceGrantResultV1,
} from '@databreeze/domain/evidence-grant/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';
import type { EvidenceGrantRepositoryPortV1 } from './evidence-grant-repository.port.js';

export type EvidenceGrantServiceErrorV1 =
  | 'GRANT_NOT_FOUND'
  | 'GRANT_REVOKED'
  | 'GRANT_EXPIRED'
  | 'DEVICE_MISMATCH'
  | 'EPOCH_MISMATCH'
  | 'EVIDENCE_NOT_FOUND'
  | 'ARTIFACT_REPOSITORY_UNAVAILABLE';
export type EvidenceGrantServiceResultV1<TValue> =
  | EvidenceGrantResultV1<TValue>
  | { readonly accepted: false; readonly code: EvidenceGrantServiceErrorV1 };

export class EvidenceGrantService {
  public constructor(
    private readonly repository: EvidenceGrantRepositoryPortV1,
    private readonly artifactRepository?: ArtifactRepositoryPortV1,
  ) {}

  public async issue(
    context: IamTenantContextV1,
    input: Omit<Parameters<typeof createEvidenceAccessGrantV1>[0], 'tenantScope'>,
  ): Promise<EvidenceGrantServiceResultV1<EvidenceAccessGrantV1>> {
    if (input.authorizationEpoch !== context.authorizationEpoch)
      return { accepted: false, code: 'EPOCH_MISMATCH' };
    const created = createEvidenceAccessGrantV1({ ...input, tenantScope: context.tenantScope });
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, created.value.grantId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('IAE_IMMUTABLE_GRANT');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async resolve(
    context: IamTenantContextV1,
    input: {
      readonly grantId: unknown;
      readonly recipientDeviceId: unknown;
      readonly authorizationEpoch: unknown;
      readonly now: unknown;
    },
  ): Promise<EvidenceGrantServiceResultV1<EvidenceAccessGrantV1>> {
    const grantId = parseStableIdentifierV1(input.grantId);
    const recipientDeviceId = parseStableIdentifierV1(input.recipientDeviceId);
    if (!grantId.accepted || !recipientDeviceId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' };
    if (
      typeof input.authorizationEpoch !== 'number' ||
      !Number.isSafeInteger(input.authorizationEpoch) ||
      input.authorizationEpoch < 1
    )
      return { accepted: false, code: 'INVALID_EPOCH' };
    if (input.authorizationEpoch !== context.authorizationEpoch)
      return { accepted: false, code: 'EPOCH_MISMATCH' };
    if (typeof input.now !== 'string' || Number.isNaN(Date.parse(input.now)))
      return { accepted: false, code: 'INVALID_TIMESTAMP' };
    const now = input.now;
    return this.repository.withTransaction(context, async (transaction) => {
      const grant = await transaction.find(context, grantId.value);
      if (!grant) return { accepted: false as const, code: 'GRANT_NOT_FOUND' as const };
      if (await transaction.isRevoked(context, grant.grantId))
        return { accepted: false as const, code: 'GRANT_REVOKED' as const };
      if (grant.recipientDeviceId !== recipientDeviceId.value)
        return { accepted: false as const, code: 'DEVICE_MISMATCH' as const };
      if (grant.authorizationEpoch !== input.authorizationEpoch)
        return { accepted: false as const, code: 'EPOCH_MISMATCH' as const };
      if (Date.parse(now) >= Date.parse(grant.expiresAt))
        return { accepted: false as const, code: 'GRANT_EXPIRED' as const };
      return { accepted: true as const, value: grant };
    });
  }

  /** Derives data mode and source state from the exact immutable artifact record. */
  public async issueForEvidence(
    context: IamTenantContextV1,
    input: {
      readonly versionId: unknown;
      readonly evidenceId: unknown;
      readonly grantId: unknown;
      readonly recipientDeviceId: unknown;
      readonly action: unknown;
      readonly issuedAt: unknown;
      readonly expiresAt: unknown;
      readonly authorizationEpoch: unknown;
      readonly maxExcerptBytes?: unknown;
    },
  ): Promise<EvidenceGrantServiceResultV1<EvidenceAccessGrantV1>> {
    if (!this.artifactRepository)
      return { accepted: false, code: 'ARTIFACT_REPOSITORY_UNAVAILABLE' };
    const versionId = parseStableIdentifierV1(input.versionId);
    const evidenceId = parseStableIdentifierV1(input.evidenceId);
    if (!versionId.accepted || !evidenceId.accepted)
      return { accepted: false, code: 'INVALID_IDENTIFIER' };
    const source = await this.artifactRepository.withTransaction(context, async (transaction) => {
      const version = await transaction.findVersion(context, versionId.value);
      if (!version) return undefined;
      const evidence = (await transaction.listEvidence(context, versionId.value)).find(
        (candidate) => candidate.evidenceId === evidenceId.value,
      );
      return evidence
        ? { dataMode: version.dataMode, sourceState: evidence.sourceState }
        : undefined;
    });
    if (!source) return { accepted: false, code: 'EVIDENCE_NOT_FOUND' };
    return this.issue(context, {
      ...input,
      artifactVersionId: versionId.value,
      evidenceId: evidenceId.value,
      artifactDataMode: source.dataMode,
      sourceState: source.sourceState,
    });
  }

  public async revoke(
    context: IamTenantContextV1,
    grantIdInput: unknown,
  ): Promise<EvidenceGrantServiceResultV1<true>> {
    const grantId = parseStableIdentifierV1(grantIdInput);
    if (!grantId.accepted) return { accepted: false, code: 'INVALID_IDENTIFIER' };
    return this.repository.withTransaction(context, async (transaction) => {
      const grant = await transaction.find(context, grantId.value);
      if (!grant) return { accepted: false as const, code: 'GRANT_NOT_FOUND' as const };
      await transaction.revoke(context, grant.grantId);
      return { accepted: true as const, value: true };
    });
  }
}
