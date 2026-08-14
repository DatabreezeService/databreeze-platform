import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

/**
 * DSM-018 boundary: the controller selects the closed action; IAM resolves the
 * current principal, membership, preset, and dataset restriction server-side.
 */
export const GOVERNED_DATASET_AUTHORIZATION_PORT = Symbol('GOVERNED_DATASET_AUTHORIZATION_PORT');

/** Compatibility alias for compositions that name the boundary as an authority. */
export const GOVERNED_DATASET_AUTHORITY_PORT = GOVERNED_DATASET_AUTHORIZATION_PORT;

export type GovernedDatasetAuthorizationActionV1 =
  | 'READ_INDEX'
  | 'READ_VERSION'
  | 'CREATE_DRAFT'
  | 'PUBLISH'
  | 'COMPARE';

export type GovernedDatasetAuthorizationErrorCodeV1 =
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_REVOKED'
  | 'DATASET_RESTRICTED'
  | 'ACTION_DENIED'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_SCOPE';

export interface GovernedDatasetAuthorizationInputV1 {
  readonly action: GovernedDatasetAuthorizationActionV1;
  readonly datasetId?: StableIdentifierV1;
  readonly versionId?: StableIdentifierV1;
}

export type GovernedDatasetAuthorizationResultV1 =
  | { readonly accepted: true; readonly value: true }
  | {
      readonly accepted: false;
      readonly code: GovernedDatasetAuthorizationErrorCodeV1;
    };

const GOVERNED_DATASET_AUTHORIZATION_ERROR_CODES = new Set<GovernedDatasetAuthorizationErrorCodeV1>(
  [
    'AUTHORIZATION_UNAVAILABLE',
    'MEMBERSHIP_NOT_FOUND',
    'MEMBERSHIP_REVOKED',
    'DATASET_RESTRICTED',
    'ACTION_DENIED',
    'SCOPE_DENIED',
    'NOT_FOUND',
    'FORBIDDEN',
    'INVALID_IDENTIFIER',
    'INVALID_SCOPE',
  ],
);

/** Runtime boundary validation for adapters composed outside DSM. */
export function isGovernedDatasetAuthorizationResultV1(
  input: unknown,
): input is GovernedDatasetAuthorizationResultV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record['accepted'] === true) {
    return (
      keys.length === 2 &&
      keys.includes('accepted') &&
      keys.includes('value') &&
      record['value'] === true
    );
  }
  return (
    record['accepted'] === false &&
    keys.length === 2 &&
    keys.includes('accepted') &&
    keys.includes('code') &&
    typeof record['code'] === 'string' &&
    GOVERNED_DATASET_AUTHORIZATION_ERROR_CODES.has(
      record['code'] as GovernedDatasetAuthorizationErrorCodeV1,
    )
  );
}

export interface GovernedDatasetAuthorizationPortV1 {
  /**
   * Re-authorizes against current IAM state for every request. The port has no
   * client-supplied actor, membership, preset, permission, or tenant input.
   * Workspace members have all datasets by default; IAM supplies explicit
   * sensitive-dataset deny scopes when configured.
   */
  authorize(
    context: IamTenantContextV1,
    input: GovernedDatasetAuthorizationInputV1,
  ): Promise<GovernedDatasetAuthorizationResultV1>;
}

/** Safe default until the root composition supplies an IAM-backed adapter. */
export class UnavailableGovernedDatasetAuthorizationAdapter
  implements GovernedDatasetAuthorizationPortV1
{
  public authorize(
    context: IamTenantContextV1,
    input: GovernedDatasetAuthorizationInputV1,
  ): Promise<GovernedDatasetAuthorizationResultV1> {
    void context;
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}
