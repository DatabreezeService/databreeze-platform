import { createHash, randomUUID } from 'node:crypto';

import type {
  ArtifactUploadPartV1,
  ArtifactUploadSessionV1,
} from '@databreeze/domain/artifact-upload/v1';
import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ArtifactUploadPartTransferV1,
  ArtifactUploadStoragePortV1,
  ArtifactUploadStorageResultV1,
  ArtifactUploadVerifiedStorageV1,
} from '../application/artifact-upload-storage.port.js';

function accepted<TValue>(value: TValue): ArtifactUploadStorageResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected<TValue>(
  code: Exclude<ArtifactUploadStorageResultV1<TValue>, { readonly accepted: true }>['code'],
): ArtifactUploadStorageResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Deterministic test adapter that never exposes an object before finalization. */
export class InMemoryArtifactUploadStorageAdapter implements ArtifactUploadStoragePortV1 {
  private transfers = new Map<
    string,
    {
      readonly sessionId: string;
      readonly partNumber: number;
      readonly contentSha256: string;
      readonly byteSize: number;
      readonly expiresAt: number;
    }
  >();
  private parts = new Map<string, ArtifactUploadPartV1>();
  private finalized = new Set<string>();

  public constructor(private readonly clock: () => Date = () => new Date()) {}

  public async issuePartTransfer(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    input: {
      readonly partNumber: number;
      readonly contentSha256: string;
      readonly byteSize: number;
    },
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadPartTransferV1>> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    if (
      session.state !== 'OPEN' ||
      !Number.isSafeInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > session.totalParts ||
      !/^[0-9a-f]{64}$/u.test(input.contentSha256) ||
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 0 ||
      input.byteSize > session.partSize
    )
      return rejected('UPLOAD_STORAGE_NOT_READY');
    const transferId = randomUUID();
    const expiresAt = Math.min(this.clock().getTime() + 300_000, Date.parse(session.expiresAt));
    this.transfers.set(transferId, {
      sessionId: session.sessionId,
      partNumber: input.partNumber,
      contentSha256: input.contentSha256,
      byteSize: input.byteSize,
      expiresAt,
    });
    return accepted({
      transferId,
      sessionId: session.sessionId,
      partNumber: input.partNumber,
      method: 'PUT',
      url: `memory://artifact-upload/${transferId}`,
      requiredHeaders: Object.freeze({
        'content-length': String(input.byteSize),
        'x-amz-checksum-sha256': Buffer.from(input.contentSha256, 'hex').toString('base64'),
      }),
      expiresAt: new Date(expiresAt).toISOString() as ArtifactUploadSessionV1['expiresAt'],
    });
  }

  public async verifyPart(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    part: ArtifactUploadPartV1,
    transferId?: string,
  ): Promise<ArtifactUploadStorageResultV1<void>> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    if (session.state !== 'OPEN') return rejected('UPLOAD_STORAGE_NOT_READY');
    if (transferId !== undefined) {
      const transfer = this.transfers.get(transferId);
      if (
        transfer === undefined ||
        transfer.sessionId !== session.sessionId ||
        transfer.partNumber !== part.partNumber ||
        transfer.contentSha256 !== part.contentSha256 ||
        transfer.byteSize !== part.byteSize ||
        transfer.expiresAt <= this.clock().getTime()
      )
        return rejected('UPLOAD_STORAGE_TRANSFER_INVALID');
      this.transfers.delete(transferId);
    }
    const key = `${session.sessionId}:${part.partNumber}`;
    const existing = this.parts.get(key);
    if (
      existing &&
      (existing.contentSha256 !== part.contentSha256 || existing.byteSize !== part.byteSize)
    )
      return rejected('UPLOAD_STORAGE_PART_REJECTED');
    this.parts.set(key, part);
    return accepted(undefined);
  }

  public async finalize(
    context: IamTenantContextV1,
    session: ArtifactUploadSessionV1,
    assembledSha256: string,
  ): Promise<ArtifactUploadStorageResultV1<ArtifactUploadVerifiedStorageV1>> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope))
      return rejected('UPLOAD_STORAGE_SCOPE_DENIED');
    if (session.state !== 'FINALIZING') return rejected('UPLOAD_STORAGE_NOT_READY');
    if (assembledSha256 !== session.expectedSha256)
      return rejected('UPLOAD_STORAGE_DIGEST_MISMATCH');
    if (session.parts.length !== session.totalParts) return rejected('UPLOAD_STORAGE_NOT_READY');
    for (const part of session.parts) {
      if (!this.parts.has(`${session.sessionId}:${part.partNumber}`))
        return rejected('UPLOAD_STORAGE_NOT_READY');
    }
    this.finalized.add(session.sessionId);
    return accepted({
      opaqueLocator: createHash('sha256').update(`memory:${session.sessionId}`).digest('base64url'),
      objectVersionId: `memory-${session.revision}`,
    });
  }

  public async abort(context: IamTenantContextV1, session: ArtifactUploadSessionV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, session.tenantScope)) return;
    for (const key of this.parts.keys())
      if (key.startsWith(`${session.sessionId}:`)) this.parts.delete(key);
    for (const [transferId, transfer] of this.transfers) {
      if (transfer.sessionId === session.sessionId) this.transfers.delete(transferId);
    }
    this.finalized.delete(session.sessionId);
  }
}
