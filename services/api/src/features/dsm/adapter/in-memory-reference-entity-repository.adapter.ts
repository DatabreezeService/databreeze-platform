import {
  tenantScopeContainsV1,
  type BusinessPartyResolutionV1,
  type BusinessPartyVersionV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  ReferenceEntityRepositoryPortV1,
  ReferenceEntityTransactionPortV1,
} from '../application/reference-entity-repository.port.js';

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function cloneVersion(version: BusinessPartyVersionV1): BusinessPartyVersionV1 {
  return Object.freeze({
    ...version,
    tenantScope: Object.freeze({ ...version.tenantScope }),
    roles: Object.freeze([...version.roles]),
    aliases: Object.freeze([...version.aliases]),
    externalIdentifiers: Object.freeze(version.externalIdentifiers.map((item) => Object.freeze({ ...item }))),
  });
}

function cloneResolution(resolution: BusinessPartyResolutionV1): BusinessPartyResolutionV1 {
  return Object.freeze({ ...resolution });
}

export class InMemoryReferenceEntityRepositoryAdapter implements ReferenceEntityRepositoryPortV1 {
  private versions = new Map<string, BusinessPartyVersionV1>();
  private resolutions = new Map<string, BusinessPartyResolutionV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  public async saveVersion(context: IamTenantContextV1, version: BusinessPartyVersionV1): Promise<void> {
    await Promise.resolve();
    if (!tenantScopeContainsV1(context.tenantScope, version.tenantScope)) throw new Error('DSM_SCOPE_NARROWING_REQUIRED');
    const existing = this.versions.get(version.versionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(version)) throw new Error('DSM_IMMUTABLE_REFERENCE_VERSION');
    this.versions.set(version.versionId, cloneVersion(version));
  }

  public async findVersion(context: IamTenantContextV1, versionId: StableIdentifierV1): Promise<BusinessPartyVersionV1 | undefined> {
    await Promise.resolve();
    const version = this.versions.get(versionId);
    return version && visible(context.tenantScope, version.tenantScope) ? cloneVersion(version) : undefined;
  }

  public async findLatest(context: IamTenantContextV1, entityId: StableIdentifierV1): Promise<BusinessPartyVersionV1 | undefined> {
    const versions = await this.listVersions(context, entityId);
    return versions.at(-1);
  }

  public async listVersions(context: IamTenantContextV1, entityId: StableIdentifierV1): Promise<readonly BusinessPartyVersionV1[]> {
    await Promise.resolve();
    return [...this.versions.values()]
      .filter((version) => version.entityId === entityId && visible(context.tenantScope, version.tenantScope))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneVersion);
  }

  public async saveResolution(context: IamTenantContextV1, resolution: BusinessPartyResolutionV1): Promise<void> {
    await Promise.resolve();
    const source = [...this.versions.values()].find((candidate) => candidate.entityId === resolution.sourceEntityId);
    const target = [...this.versions.values()].find((candidate) => candidate.entityId === resolution.targetEntityId);
    if (!source || !target || !visible(context.tenantScope, source.tenantScope) || !visible(context.tenantScope, target.tenantScope)) throw new Error('DSM_REFERENCE_ENTITY_NOT_FOUND');
    const existing = this.resolutions.get(resolution.resolutionId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(resolution)) throw new Error('DSM_IMMUTABLE_REFERENCE_RESOLUTION');
    this.resolutions.set(resolution.resolutionId, cloneResolution(resolution));
  }

  public async listResolutions(context: IamTenantContextV1, entityId: StableIdentifierV1): Promise<readonly BusinessPartyResolutionV1[]> {
    await Promise.resolve();
    return [...this.resolutions.values()]
      .filter((resolution) => {
        const source = [...this.versions.values()].find((candidate) => candidate.entityId === resolution.sourceEntityId);
        return (resolution.sourceEntityId === entityId || resolution.targetEntityId === entityId) && source !== undefined && visible(context.tenantScope, source.tenantScope);
      })
      .sort((left, right) => left.resolvedAt.localeCompare(right.resolvedAt))
      .map(cloneResolution);
  }

  public async withTransaction<TValue>(context: IamTenantContextV1, work: (transaction: ReferenceEntityTransactionPortV1) => Promise<TValue>): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const beforeVersions = new Map(this.versions);
    const beforeResolutions = new Map(this.resolutions);
    try {
      return await work({ saveVersion: this.saveVersion.bind(this), findVersion: this.findVersion.bind(this), findLatest: this.findLatest.bind(this), listVersions: this.listVersions.bind(this), saveResolution: this.saveResolution.bind(this), listResolutions: this.listResolutions.bind(this) });
    } catch (error) {
      this.versions = beforeVersions;
      this.resolutions = beforeResolutions;
      throw error;
    } finally {
      release();
    }
  }
}
