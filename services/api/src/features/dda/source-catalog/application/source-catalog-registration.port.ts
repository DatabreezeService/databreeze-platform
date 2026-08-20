import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { SourceCatalogRecordV1 } from './source-catalog-repository.port.js';

/**
 * Server-owned registration boundary for sources that have completed IAE
 * admission and DSM publication.  The read repository intentionally remains
 * separate so callers cannot smuggle source metadata into a client response.
 */
export const SOURCE_CATALOG_REGISTRATION_PORT = Symbol('SOURCE_CATALOG_REGISTRATION_PORT');

export interface SourceCatalogRegistrationPortV1 {
  register(
    context: IamTenantContextV1,
    record: SourceCatalogRecordV1,
  ): Promise<void>;
}
