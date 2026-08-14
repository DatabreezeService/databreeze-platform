import { tenantScopeContainsV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { AccessPresetService } from '../../iam/application/access-preset.service.js';
import type { AgentGrantRepositoryPortV1 } from '../../iam/application/agent-grant-repository.port.js';
import type { IamRepositoryPortV1 } from '../../iam/application/iam-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  GovernedDatasetAuthorizationInputV1,
  GovernedDatasetAuthorizationPortV1,
  GovernedDatasetAuthorizationResultV1,
} from '../application/governed-dataset-authorization.port.js';

function accepted(): GovernedDatasetAuthorizationResultV1 {
  return Object.freeze({ accepted: true, value: true });
}

function rejected(
  code: Exclude<
    GovernedDatasetAuthorizationResultV1,
    { readonly accepted: true; readonly value: true }
  >['code'],
): GovernedDatasetAuthorizationResultV1 {
  return Object.freeze({ accepted: false, code });
}

function requiresDataset(
  input: GovernedDatasetAuthorizationInputV1,
): input is GovernedDatasetAuthorizationInputV1 & { readonly datasetId: NonNullable<unknown> } {
  return input.action !== 'READ_INDEX';
}

function isMutation(input: GovernedDatasetAuthorizationInputV1): boolean {
  return (
    input.action === 'CREATE_DRAFT' || input.action === 'PUBLISH' || input.action === 'COMPARE'
  );
}

function restrictionContext(context: IamTenantContextV1): IamTenantContextV1 | undefined {
  if (context.tenantScope.scopeType === 'organization') return undefined;
  if (context.tenantScope.scopeType === 'workspace') return context;
  const tenantScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: context.tenantScope.organizationId,
    workspaceId: context.tenantScope.workspaceId,
  };
  return Object.freeze({ ...context, tenantScope });
}

/**
 * DSM-018 composition adapter. It depends only on IAM application ports and
 * keeps membership, preset, and restriction decisions server-owned.
 */
export class IamGovernedDatasetAuthorizationAdapter implements GovernedDatasetAuthorizationPortV1 {
  public constructor(
    private readonly memberships: IamRepositoryPortV1,
    private readonly accessPresets: AccessPresetService,
    private readonly restrictions: AgentGrantRepositoryPortV1,
  ) {}

  public async authorize(
    context: IamTenantContextV1,
    input: GovernedDatasetAuthorizationInputV1,
  ): Promise<GovernedDatasetAuthorizationResultV1> {
    try {
      const membership = await this.memberships.findMembership(context, context.actorId);
      if (
        membership === undefined ||
        membership.status !== 'ACTIVE' ||
        !tenantScopeContainsV1(membership.scope, context.tenantScope)
      ) {
        return rejected('MEMBERSHIP_NOT_FOUND');
      }
      if (requiresDataset(input) && typeof input.datasetId !== 'string') {
        return rejected('INVALID_IDENTIFIER');
      }
      const scopedRestrictionContext = restrictionContext(context);
      if (scopedRestrictionContext === undefined) return rejected('INVALID_SCOPE');

      const preset = this.accessPresets.presetForRoleId(membership.roleId);
      if (preset === undefined) return rejected('ACTION_DENIED');
      if (isMutation(input) && preset === 'VIEWER') return rejected('ACTION_DENIED');

      if (input.datasetId !== undefined) {
        const restriction = await this.restrictions.findDatasetRestrictions(
          scopedRestrictionContext,
          membership.id,
        );
        if (restriction?.deniedDatasetIds.includes(input.datasetId)) {
          return rejected('DATASET_RESTRICTED');
        }
      }
      return accepted();
    } catch {
      return rejected('AUTHORIZATION_UNAVAILABLE');
    }
  }
}
