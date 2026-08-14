import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AnalysisCatalogAuthorityPortV1,
  AnalysisCatalogAuthorityRequestV1,
  AnalysisCatalogAuthorityResultV1,
} from '../application/analysis-catalog.port.js';

/**
 * Server-side bridge to the current IAM/DSM/permission authorities.
 * It intentionally stores no catalog and converts authority outages into a closed result.
 */
export class ServerAuthoritativeAnalysisCatalogAdapterV1 implements AnalysisCatalogAuthorityPortV1 {
  public constructor(private readonly authority: AnalysisCatalogAuthorityPortV1) {}

  public async load(
    context: IamTenantContextV1,
    request: AnalysisCatalogAuthorityRequestV1,
  ): Promise<AnalysisCatalogAuthorityResultV1> {
    try {
      return await this.authority.load(context, request);
    } catch {
      return Object.freeze({ status: 'UNAVAILABLE' as const });
    }
  }
}

/** Default composition until the foundation authorities are wired. */
export class UnavailableAnalysisCatalogAuthorityAdapterV1
  implements AnalysisCatalogAuthorityPortV1
{
  public load(): Promise<AnalysisCatalogAuthorityResultV1> {
    return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE' as const }));
  }
}
