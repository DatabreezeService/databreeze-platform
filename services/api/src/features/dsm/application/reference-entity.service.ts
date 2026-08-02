import {
  createBusinessPartyVersionV1,
  mergeBusinessPartyVersionsV1,
  type BusinessPartyResolutionV1,
  type BusinessPartyVersionV1,
  type ReferenceEntityResultV1,
} from '@databreeze/domain/reference-entity/v1';
import { parseStableIdentifierV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ReferenceEntityRepositoryPortV1 } from './reference-entity-repository.port.js';

export type ReferenceEntityServiceErrorV1 = 'ENTITY_NOT_FOUND' | 'ACTOR_MISMATCH';
export type ReferenceEntityServiceResultV1<TValue> = ReferenceEntityResultV1<TValue> | { readonly accepted: false; readonly code: ReferenceEntityServiceErrorV1 };

export class ReferenceEntityService {
  public constructor(private readonly repository: ReferenceEntityRepositoryPortV1) {}

  public async create(context: IamTenantContextV1, input: Parameters<typeof createBusinessPartyVersionV1>[0]): Promise<ReferenceEntityServiceResultV1<BusinessPartyVersionV1>> {
    const created = createBusinessPartyVersionV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findVersion(context, created.value.versionId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(created.value)) return created;
        throw new Error('DSM_IMMUTABLE_REFERENCE_VERSION');
      }
      await transaction.saveVersion(context, created.value);
      return created;
    });
  }

  public async merge(context: IamTenantContextV1, input: {
    readonly sourceEntityId: unknown;
    readonly targetEntityId: unknown;
    readonly resolutionId: unknown;
    readonly actorId: unknown;
    readonly reason: unknown;
    readonly evidenceId: unknown;
    readonly resolvedAt: unknown;
  }): Promise<ReferenceEntityServiceResultV1<BusinessPartyResolutionV1>> {
    const sourceEntityId = parseStableIdentifierV1(input.sourceEntityId);
    const targetEntityId = parseStableIdentifierV1(input.targetEntityId);
    const actorId = parseStableIdentifierV1(input.actorId);
    if (!sourceEntityId.accepted || !targetEntityId.accepted || !actorId.accepted) return Object.freeze({ accepted: false as const, code: 'INVALID_IDENTIFIER' as const });
    if (actorId.value !== context.actorId) return Object.freeze({ accepted: false as const, code: 'ACTOR_MISMATCH' as const });
    return this.repository.withTransaction(context, async (transaction) => {
      const source = await transaction.findLatest(context, sourceEntityId.value);
      const target = await transaction.findLatest(context, targetEntityId.value);
      if (!source || !target) return Object.freeze({ accepted: false as const, code: 'ENTITY_NOT_FOUND' as const });
      const resolution = mergeBusinessPartyVersionsV1({ source, target, ...input, actorId: actorId.value });
      if (!resolution.accepted) return resolution;
      await transaction.saveResolution(context, resolution.value);
      return resolution;
    });
  }

  public async listVersions(context: IamTenantContextV1, entityId: StableIdentifierV1): Promise<readonly BusinessPartyVersionV1[]> {
    return this.repository.withTransaction(context, (transaction) => transaction.listVersions(context, entityId));
  }

  public async listResolutions(context: IamTenantContextV1, entityId: StableIdentifierV1): Promise<readonly BusinessPartyResolutionV1[]> {
    return this.repository.withTransaction(context, (transaction) => transaction.listResolutions(context, entityId));
  }
}
