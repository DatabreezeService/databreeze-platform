import {
  authorizeArtifactDeletionV1,
  blockArtifactDeletionV1,
  createArtifactDeletionRequestV1,
  type ArtifactDeletionRequestV1,
  type ArtifactRetentionResultV1,
} from '@databreeze/domain/artifact-retention/v1';
import { evaluateArtifactRetentionV1 } from '@databreeze/domain/artifact-governance/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from './artifact-repository.port.js';
import type { ArtifactRetentionRepositoryPortV1 } from './artifact-retention-repository.port.js';

export type ArtifactRetentionServiceErrorV1 = 'ARTIFACT_NOT_FOUND' | 'REQUEST_NOT_FOUND';
export type ArtifactRetentionServiceResultV1<TValue> =
  | ArtifactRetentionResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactRetentionServiceErrorV1 };

/** Keeps retention policy and deletion-request state in IAE; object erasure remains asynchronous. */
export class ArtifactRetentionService {
  public constructor(
    private readonly requests: ArtifactRetentionRepositoryPortV1,
    private readonly artifacts: ArtifactRepositoryPortV1,
  ) {}

  public async request(
    context: IamTenantContextV1,
    input: Parameters<typeof createArtifactDeletionRequestV1>[0] & {
      readonly retention: Parameters<typeof evaluateArtifactRetentionV1>[0];
    },
  ): Promise<ArtifactRetentionServiceResultV1<ArtifactDeletionRequestV1>> {
    const created = createArtifactDeletionRequestV1(input);
    if (!created.accepted) return created;
    const artifactVersionId = parseStableIdentifierV1(input.artifactVersionId);
    if (!artifactVersionId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const artifact = await this.artifacts.findVersion(context, artifactVersionId.value);
    if (!artifact) return Object.freeze({ accepted: false, code: 'ARTIFACT_NOT_FOUND' as const });
    const evaluation = evaluateArtifactRetentionV1(input.retention);
    if (!evaluation.accepted)
      return Object.freeze({
        accepted: false as const,
        code:
          evaluation.code === 'INVALID_TIMESTAMP'
            ? ('INVALID_TIMESTAMP' as const)
            : ('INVALID_STATE' as const),
      });
    const next = evaluation.value.eligible
      ? created
      : blockArtifactDeletionV1(created.value, evaluation.value);
    if (!next.accepted) return next;
    return this.requests.withTransaction(context, async (transaction) => {
      const existing = await transaction.find(context, next.value.requestId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(next.value))
          return { accepted: true, value: existing };
        throw new Error('IAE_IMMUTABLE_DELETION_REQUEST');
      }
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async authorize(
    context: IamTenantContextV1,
    input: {
      readonly requestId: unknown;
      readonly retention: Parameters<typeof evaluateArtifactRetentionV1>[0];
      readonly approvedAt: unknown;
      readonly mfaSatisfied: unknown;
      readonly expectedRevision?: unknown;
    },
  ): Promise<ArtifactRetentionServiceResultV1<ArtifactDeletionRequestV1>> {
    const requestId = parseStableIdentifierV1(input.requestId);
    if (!requestId.accepted)
      return Object.freeze({ accepted: false, code: 'INVALID_IDENTIFIER' as const });
    const evaluation = evaluateArtifactRetentionV1(input.retention);
    if (!evaluation.accepted)
      return Object.freeze({
        accepted: false as const,
        code:
          evaluation.code === 'INVALID_TIMESTAMP'
            ? ('INVALID_TIMESTAMP' as const)
            : ('INVALID_STATE' as const),
      });
    return this.requests.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, requestId.value);
      if (!current) return Object.freeze({ accepted: false, code: 'REQUEST_NOT_FOUND' as const });
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision)
        return Object.freeze({ accepted: false, code: 'INVALID_REVISION' as const });
      const authorized = authorizeArtifactDeletionV1(current, evaluation.value, {
        tenantScope: context.tenantScope,
        approvedAt: input.approvedAt,
        mfaSatisfied: input.mfaSatisfied,
      });
      if (!authorized.accepted) return authorized;
      await transaction.save(context, authorized.value);
      return authorized;
    });
  }
}
