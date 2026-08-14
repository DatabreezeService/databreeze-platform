import { tenantScopesEqualV1, type StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  AgentGrantDatasetTargetValidationPortV1,
  AgentGrantDatasetTargetValidationResultV1,
} from '../../iam/application/agent-grant-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { GovernedDatasetRepositoryPortV1 } from '../application/governed-dataset-repository.port.js';

function notFound(): AgentGrantDatasetTargetValidationResultV1 {
  return Object.freeze({ accepted: false as const, code: 'NOT_FOUND' as const });
}

function unavailable(): AgentGrantDatasetTargetValidationResultV1 {
  return Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const });
}

/** Root-composed DSM catalog check for IAM's opaque dataset restriction targets. */
export class IamAgentGrantDatasetTargetValidationAdapter
  implements AgentGrantDatasetTargetValidationPortV1
{
  public constructor(private readonly catalog: GovernedDatasetRepositoryPortV1) {}

  public async validate(
    context: IamTenantContextV1,
    datasetIds: readonly StableIdentifierV1[],
  ): Promise<AgentGrantDatasetTargetValidationResultV1> {
    if (context.tenantScope.scopeType !== 'workspace') return notFound();
    try {
      return await this.catalog.withTransaction(context, async (transaction) => {
        for (const datasetId of datasetIds) {
          const definitions = await transaction.list(context, datasetId);
          const current = definitions.some(
            (definition) =>
              definition.status === 'PUBLISHED' &&
              definition.datasetId === datasetId &&
              tenantScopesEqualV1(definition.tenantScope, context.tenantScope),
          );
          if (!current) return notFound();
        }
        return Object.freeze({ accepted: true as const });
      });
    } catch {
      return unavailable();
    }
  }
}
