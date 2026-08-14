import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  GovernedDatasetAuthorizationPortV1,
  GovernedDatasetAuthorizationResultV1,
} from '../../../dsm/application/governed-dataset-authorization.port.js';
import type {
  SourceCatalogAuthorizationInputV1,
  SourceCatalogAuthorizationPortV1,
  SourceCatalogAuthorizationResultV1,
} from '../application/source-catalog-authorization.port.js';

function accepted(): SourceCatalogAuthorizationResultV1 {
  return Object.freeze({ accepted: true, value: true });
}

function rejected(
  code: Extract<SourceCatalogAuthorizationResultV1, { readonly accepted: false }>['code'],
): SourceCatalogAuthorizationResultV1 {
  return Object.freeze({ accepted: false, code });
}

function exactStableIdentifier(value: unknown): StableIdentifierV1 | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted && parsed.value === value ? parsed.value : undefined;
}

function mapGovernedDecision(
  decision: GovernedDatasetAuthorizationResultV1,
): SourceCatalogAuthorizationResultV1 {
  if (decision.accepted) return accepted();
  return decision.code === 'AUTHORIZATION_UNAVAILABLE'
    ? rejected('AUTHORIZATION_UNAVAILABLE')
    : rejected('NOT_FOUND');
}

/**
 * Root composition adapter for DDA-052. IAM/DSM remains the sole authority;
 * source-catalog callers cannot supply actor, membership, scope, or a broad
 * dataset selector. Denials are intentionally non-enumerating.
 */
export class IamSourceCatalogAuthorizationAdapter implements SourceCatalogAuthorizationPortV1 {
  public constructor(private readonly governed: GovernedDatasetAuthorizationPortV1) {}

  public async authorize(
    context: IamTenantContextV1,
    input: SourceCatalogAuthorizationInputV1,
  ): Promise<SourceCatalogAuthorizationResultV1> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return rejected('NOT_FOUND');
    }
    const record = input as unknown as Record<string, unknown>;
    const allowedKeys = new Set(['action', 'datasetId', 'sourceId', 'versionId']);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
      return rejected('NOT_FOUND');
    }
    const datasetId = exactStableIdentifier(record['datasetId']);
    if (datasetId === undefined) return rejected('NOT_FOUND');
    const action = record['action'];
    if (action !== 'READ_INDEX' && action !== 'READ_VERSION') {
      return rejected('NOT_FOUND');
    }

    const rawSourceId = record['sourceId'];
    if (rawSourceId !== undefined && exactStableIdentifier(rawSourceId) === undefined) {
      return rejected('NOT_FOUND');
    }
    const rawVersionId = record['versionId'];
    const versionId = rawVersionId === undefined ? undefined : exactStableIdentifier(rawVersionId);
    if (rawVersionId !== undefined && versionId === undefined) return rejected('NOT_FOUND');

    try {
      const decision = await this.governed.authorize(context, {
        action,
        datasetId,
        ...(versionId === undefined ? {} : { versionId }),
      });
      return mapGovernedDecision(decision);
    } catch {
      return rejected('AUTHORIZATION_UNAVAILABLE');
    }
  }
}
