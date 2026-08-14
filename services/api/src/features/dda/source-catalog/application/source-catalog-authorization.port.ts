import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

/** Source-catalog read authorization stays behind a narrow DSM/IAM composition boundary. */
export const SOURCE_CATALOG_AUTHORIZATION_PORT = Symbol('SOURCE_CATALOG_AUTHORIZATION_PORT');

export type SourceCatalogAuthorizationActionV1 = 'READ_INDEX' | 'READ_VERSION';

export type SourceCatalogAuthorizationCodeV1 =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'AUTHORIZATION_UNAVAILABLE'
  | 'UNAVAILABLE';

export interface SourceCatalogAuthorizationInputV1 {
  readonly action: SourceCatalogAuthorizationActionV1;
  readonly datasetId: StableIdentifierV1;
  readonly sourceId?: StableIdentifierV1;
  readonly versionId?: StableIdentifierV1;
}

export type SourceCatalogAuthorizationResultV1 =
  | { readonly accepted: true; readonly value: true }
  | { readonly accepted: false; readonly code: SourceCatalogAuthorizationCodeV1 };

export interface SourceCatalogAuthorizationPortV1 {
  /** Re-authorizes the current actor without accepting client authority fields. */
  authorize(
    context: IamTenantContextV1,
    input: SourceCatalogAuthorizationInputV1,
  ): Promise<SourceCatalogAuthorizationResultV1>;
}

/** Safe default until root composition supplies the DSM/IAM-backed authority. */
export class UnavailableSourceCatalogAuthorizationAdapter
  implements SourceCatalogAuthorizationPortV1
{
  public authorize(
    context: IamTenantContextV1,
    input: SourceCatalogAuthorizationInputV1,
  ): Promise<SourceCatalogAuthorizationResultV1> {
    void context;
    void input;
    return Promise.resolve({ accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' });
  }
}
