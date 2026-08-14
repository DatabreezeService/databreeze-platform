import { randomUUID } from 'node:crypto';

import {
  abortArtifactUploadSessionV1,
  beginArtifactUploadFinalizationV1,
  completeArtifactUploadFinalizationV1,
  createArtifactUploadSessionV1,
  expireArtifactUploadSessionV1,
  recordArtifactUploadPartV1,
  type ArtifactUploadResultV1,
  type ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactUploadRepositoryPortV1 } from './artifact-upload-repository.port.js';
import type {
  ArtifactUploadPartTransferV1,
  ArtifactUploadStoragePortV1,
  ArtifactUploadStorageResultV1,
} from './artifact-upload-storage.port.js';
import type {
  ArtifactUploadAdmissionPortV1,
  ArtifactUploadAdmissionResultV1,
  ArtifactUploadDeclarationV1,
} from './artifact-upload-admission.port.js';

export type ArtifactUploadServiceErrorV1 =
  | 'UPLOAD_NOT_FOUND'
  | 'UPLOAD_SCOPE_NARROWING_REQUIRED'
  | 'UPLOAD_SESSION_EXPIRED';
export type ArtifactUploadServiceResultV1<TValue> =
  | ArtifactUploadResultV1<TValue>
  | ArtifactUploadStorageResultV1<TValue>
  | ArtifactUploadAdmissionResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactUploadServiceErrorV1 };

/** Coordinates revisioned upload state without accepting paths, URLs, or raw bytes. */
export class ArtifactUploadService {
  public constructor(
    private readonly repository: ArtifactUploadRepositoryPortV1,
    private readonly storage: ArtifactUploadStoragePortV1,
    private readonly admission: ArtifactUploadAdmissionPortV1,
    private readonly runtime: {
      readonly clock?: () => Date;
      readonly ids?: { next(): string };
      readonly sessionTtlMs?: number;
    } = {},
  ) {}

  public async create(
    context: IamTenantContextV1,
    input: ArtifactUploadDeclarationV1,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    const admitted = await this.admission.admitCreate(context, input);
    if (!admitted.accepted) return admitted;
    const now = this.runtime.clock?.() ?? new Date();
    const ttl = this.runtime.sessionTtlMs ?? 24 * 60 * 60 * 1000;
    if (!Number.isFinite(now.getTime()) || ttl < 1 || ttl > 24 * 60 * 60 * 1000)
      return Object.freeze({ accepted: false, code: 'UPLOAD_ADMISSION_UNAVAILABLE' as const });
    const decision = admitted.value;
    const created = createArtifactUploadSessionV1({
      sessionId: this.runtime.ids?.next() ?? randomUUID(),
      artifactId: decision.artifactId,
      artifactVersionId: decision.artifactVersionId,
      intakeId: decision.intakeId,
      policyVersionId: decision.policyVersionId,
      authorizationEpoch: decision.authorizationEpoch,
      tenantScope: decision.tenantScope,
      expectedSha256: decision.expectedSha256,
      expectedByteSize: decision.expectedByteSize,
      mediaType: decision.mediaType,
      partSize: decision.partSize,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
    });
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
    input: Parameters<typeof recordArtifactUploadPartV1>[1] & { readonly transferId?: string },
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      const next = recordArtifactUploadPartV1(current, input);
      if (!next.accepted) return next;
      const part = next.value.parts.find((candidate) => candidate.partNumber === input.partNumber);
      if (!part)
        return Object.freeze({ accepted: false, code: 'UPLOAD_STORAGE_PART_REJECTED' as const });
      const verified = await this.storage.verifyPart(context, current, part, input.transferId);
      if (!verified.accepted) return verified;
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async complete(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    input: Parameters<typeof beginArtifactUploadFinalizationV1>[1],
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    const finalizing = await this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      if (current.state === 'FINALIZING') {
        return input.assembledSha256 === current.expectedSha256
          ? Object.freeze({ accepted: true, value: current })
          : Object.freeze({ accepted: false, code: 'DIGEST_MISMATCH' as const });
      }
      if (current.state === 'COMPLETED') return Object.freeze({ accepted: true, value: current });
      const next = beginArtifactUploadFinalizationV1(current, input);
      if (!next.accepted) return next;
      await transaction.save(context, next.value);
      return next;
    });
    if (!finalizing.accepted || finalizing.value.state === 'COMPLETED') return finalizing;
    const finalized = await this.storage.finalize(
      context,
      finalizing.value,
      input.assembledSha256 as string,
    );
    if (!finalized.accepted) return finalized;
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      if (current.state === 'COMPLETED') return Object.freeze({ accepted: true, value: current });
      const next = completeArtifactUploadFinalizationV1(current, {
        ...finalized.value,
        expectedRevision: current.revision,
      });
      if (!next.accepted) return next;
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async abort(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    expectedRevision: unknown,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      const next = abortArtifactUploadSessionV1(current, expectedRevision);
      if (!next.accepted) return next;
      await this.storage.abort(context, current);
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async expire(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    now: unknown,
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadSessionV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const current = await transaction.find(context, sessionId);
      if (!current) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      const next = expireArtifactUploadSessionV1(current, now);
      if (!next.accepted) return next;
      await this.storage.abort(context, current);
      await transaction.save(context, next.value);
      return next;
    });
  }

  public async issuePartTransfer(
    context: IamTenantContextV1,
    sessionId: ArtifactUploadSessionV1['sessionId'],
    input: {
      readonly partNumber: number;
      readonly contentSha256: string;
      readonly byteSize: number;
    },
  ): Promise<ArtifactUploadServiceResultV1<ArtifactUploadPartTransferV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const session = await transaction.find(context, sessionId);
      if (!session) return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      if (session.state === 'EXPIRED')
        return Object.freeze({ accepted: false, code: 'UPLOAD_SESSION_EXPIRED' as const });
      const admitted = await this.admission.authorizeGrant(context, session);
      if (!admitted.accepted) return admitted;
      const transfer = await this.storage.issuePartTransfer(context, session, input);
      if (!transfer.accepted) return transfer;

      const current = await transaction.find(context, sessionId);
      if (!current) {
        await this.storage.abort(context, session);
        return Object.freeze({ accepted: false, code: 'UPLOAD_NOT_FOUND' as const });
      }
      if (current.state === 'EXPIRED') {
        await this.storage.abort(context, current);
        return Object.freeze({ accepted: false, code: 'UPLOAD_SESSION_EXPIRED' as const });
      }
      if (current.state !== 'OPEN') {
        await this.storage.abort(context, current);
        return Object.freeze({ accepted: false, code: 'REVISION_CONFLICT' as const });
      }
      return transfer;
    });
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
