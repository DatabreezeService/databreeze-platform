import {
  tenantScopeContainsV1,
  type ArtifactUploadSessionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactUploadRepositoryPortV1,
  ArtifactUploadTransactionPortV1,
} from '../application/artifact-upload-repository.port.js';

function clone(session: ArtifactUploadSessionV1): ArtifactUploadSessionV1 {
  return Object.freeze({
    ...session,
    tenantScope: Object.freeze({ ...session.tenantScope }),
    parts: Object.freeze(session.parts.map((part) => Object.freeze({ ...part }))),
  });
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

export class InMemoryArtifactUploadRepositoryAdapter implements ArtifactUploadRepositoryPortV1 {
  private sessions = new Map<string, ArtifactUploadSessionV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      throw new Error('IAE_SCOPE_NARROWING_REQUIRED');
    const existing = this.sessions.get(session.sessionId);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(session)) return;
      if (session.revision !== existing.revision + 1)
        throw new Error('IAE_UPLOAD_REVISION_CONFLICT');
      if (
        existing.artifactId !== session.artifactId ||
        existing.expectedSha256 !== session.expectedSha256 ||
        existing.expectedByteSize !== session.expectedByteSize ||
        JSON.stringify(existing.tenantScope) !== JSON.stringify(session.tenantScope)
      )
        throw new Error('IAE_UPLOAD_IMMUTABLE_IDENTITY');
    }
    this.sessions.set(session.sessionId, clone(session));
  }

  public async find(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
  ): Promise<ArtifactUploadSessionV1 | undefined> {
    await Promise.resolve();
    const session = this.sessions.get(sessionId);
    return session && visible(context.tenantScope, session.tenantScope)
      ? clone(session)
      : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ArtifactUploadTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.sessions);
    try {
      return await work({ save: this.save.bind(this), find: this.find.bind(this) });
    } catch (error) {
      this.sessions = before;
      throw error;
    } finally {
      release();
    }
  }
}
