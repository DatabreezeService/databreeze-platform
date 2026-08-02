import {
  abortArtifactUploadSessionV1,
  completeArtifactUploadSessionV1,
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
  type ArtifactUploadResultV1,
  type ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactUploadRepositoryPortV1 } from './artifact-upload-repository.port.js';

export type ArtifactUploadServiceErrorV1 = 'UPLOAD_NOT_FOUND' | 'UPLOAD_SCOPE_NARROWING_REQUIRED';
export type ArtifactUploadServiceResultV1<TValue> =
  | ArtifactUploadResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactUploadServiceErrorV1 };

/** Coordinates revisioned upload state without accepting paths, URLs, or raw bytes. */
export class ArtifactUploadService {
  public constructor(private readonly repository: ArtifactUploadRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createArtifactUploadSessionV1>[0],
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    const created = createArtifactUploadSessionV1(input);
    if (!created.accepted) return created;
    if (!this.scopeAllowed(context, created.value))
      return Object.freeze({ accepted: false, code: 'UPLOAD_SCOPE_NARROWING_REQUIRED' as const });
    await this.repository.save(context, created.value);
    return created;
  }

  public async find(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
  ): Promise<ArtifactUploadSessionV1 | undefined> {
    return this.repository.find(context, sessionId);
  }

  public async recordPart(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    input: Parameters<typeof recordArtifactUploadPartV1>[1],
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.mutate(context, sessionId, (session) => recordArtifactUploadPartV1(session, input));
  }

  public async complete(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    input: Parameters<typeof completeArtifactUploadSessionV1>[1],
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.mutate(context, sessionId, (session) =>
      completeArtifactUploadSessionV1(session, input),
    );
  }

  public async abort(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    expectedRevision: unknown,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.mutate(context, sessionId, (session) =>
      abortArtifactUploadSessionV1(session, expectedRevision),
    );
  }

  public async expire(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    now: unknown,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.mutate(context, sessionId, (session) =>
      expireArtifactUploadSessionV1(session, now),
    );
  }

  private async mutate(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    operation: (
      session: ArtifactUploadSessionV1,
    ) => ArtifactUploadResultV1<ArtifactUploadSessionV1>,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      const next = operation(current);
      if (!next.accepted) return next;
      await transaction.save(context, next.value);
      return next;
    });
  }

  private scopeAllowed(context: IamTenantContextV1, session: ArtifactUploadSessionV1): boolean {
    return tenantScopeContainsV1(context.tenantScope, session.tenantScope);
  }
}
