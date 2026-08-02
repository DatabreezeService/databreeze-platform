import {
  tenantScopeContainsV1,
  type ResultManifestV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ResultManifestRepositoryPortV1,
  ResultManifestTransactionPortV1,
} from '../application/result-manifest-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function mutable(context: IamTenantContextV1, manifest: ResultManifestV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, manifest.tenantScope);
}

function clone(manifest: ResultManifestV1): ResultManifestV1 {
  return Object.freeze({
    ...manifest,
    tenantScope: Object.freeze({ ...manifest.tenantScope }),
    sourceArtifactVersionIds: Object.freeze([...manifest.sourceArtifactVersionIds]),
    outputIds: Object.freeze([...manifest.outputIds]),
    outputHashes: Object.freeze([...manifest.outputHashes]),
  });
}

/** In-memory JRA result adapter enforcing immutable manifests and scope visibility. */
export class InMemoryResultManifestRepositoryAdapter implements ResultManifestRepositoryPortV1 {
  private manifests = new Map<string, ResultManifestV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async save(context: IamTenantContextV1, manifest: ResultManifestV1): Promise<void> {
    await Promise.resolve();
    if (!mutable(context, manifest)) throw new Error('JRA_SCOPE_NARROWING_REQUIRED');
    const existing = this.manifests.get(manifest.resultManifestId);
    if (existing && JSON.stringify(existing) === JSON.stringify(manifest)) return;
    if (existing) throw new Error('JRA_IMMUTABLE_RESULT_MANIFEST');
    const attempt = [...this.manifests.values()].find(
      (candidate) => candidate.attemptId === manifest.attemptId,
    );
    if (attempt) throw new Error('JRA_ATTEMPT_RESULT_CONFLICT');
    this.manifests.set(manifest.resultManifestId, clone(manifest));
  }

  public async find(
    context: IamTenantContextV1,
    resultManifestId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined> {
    await Promise.resolve();
    const manifest = this.manifests.get(resultManifestId);
    return manifest && visible(context.tenantScope, manifest.tenantScope)
      ? clone(manifest)
      : undefined;
  }

  public async findByAttempt(
    context: IamTenantContextV1,
    attemptId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined> {
    await Promise.resolve();
    const manifest = [...this.manifests.values()].find(
      (candidate) =>
        candidate.attemptId === attemptId && visible(context.tenantScope, candidate.tenantScope),
    );
    return manifest ? clone(manifest) : undefined;
  }

  public async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: ResultManifestTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = new Map(this.manifests);
    try {
      return await work({
        save: this.save.bind(this),
        find: this.find.bind(this),
        findByAttempt: this.findByAttempt.bind(this),
      });
    } catch (error) {
      this.manifests = before;
      throw error;
    } finally {
      release();
    }
  }
}
