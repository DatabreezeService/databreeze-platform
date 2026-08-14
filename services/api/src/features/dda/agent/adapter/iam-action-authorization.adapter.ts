import { isPermissionV1, type PermissionV1 } from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AgentIamActionAuthorizationDecisionV1,
  AgentIamActionAuthorizationInputV1,
  AgentIamActionAuthorizationPortV1,
} from '../application/agent-runtime.port.js';

export interface IamActionAuthorizationSourceV1 {
  authorize(input: {
    readonly context: IamTenantContextV1;
    readonly action: PermissionV1;
    readonly resourceIds: readonly string[];
  }): Promise<{ readonly allowed: boolean }>;
}

/**
 * Server-only bridge to IAM's action evaluator. The browser cannot choose the action: the
 * registry descriptor supplies it and this adapter binds it to the authenticated context and
 * resolved opaque resource IDs.
 */
export class IamActionAuthorizationAdapter implements AgentIamActionAuthorizationPortV1 {
  public constructor(private readonly source: IamActionAuthorizationSourceV1) {}

  public async authorize(
    input: AgentIamActionAuthorizationInputV1,
  ): Promise<AgentIamActionAuthorizationDecisionV1> {
    if (!isPermissionV1(input.descriptor.requiredIamAction)) {
      return Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
    }
    const resourceIds: StableIdentifierV1[] = [];
    for (const resourceId of input.resourceIds) {
      const parsed = parseStableIdentifierV1(resourceId);
      if (!parsed.accepted) {
        return Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
      }
      resourceIds.push(parsed.value);
    }
    try {
      const decision = await this.source.authorize({
        context: input.context,
        action: input.descriptor.requiredIamAction,
        resourceIds: Object.freeze(resourceIds),
      });
      return decision.allowed
        ? Object.freeze({ allowed: true as const })
        : Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
    } catch {
      return Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const });
    }
  }
}
