import type {
  AgentGrantLevelV1,
  MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type {
  AgentToolCostClassV1,
  AgentToolDescriptorV1,
  AgentToolExecutionResultV1,
  AgentTurnProblemCodeV1,
} from './agent-tool.types.js';

export const AGENT_IAM_ACTION_AUTHORIZATION_PORT = Symbol('AGENT_IAM_ACTION_AUTHORIZATION_PORT');

// Compatibility export for consumers that resolve the agent runtime token from this public
// foundation module. The canonical token is owned by the dedicated consequential-command port.
export { AGENT_CONSEQUENTIAL_COMMAND_PORT } from './agent-consequential-command.port.js';

export const AGENT_AUTHORITY_PORT = Symbol('AGENT_AUTHORITY_PORT');
export const AGENT_USAGE_PORT = Symbol('AGENT_USAGE_PORT');
export const AGENT_TOOL_EXECUTOR_PORT = Symbol('AGENT_TOOL_EXECUTOR_PORT');

export type AgentAuthorityDecisionV1 =
  | {
      readonly allowed: true;
      readonly effectiveAgentLevel: AgentGrantLevelV1;
      readonly accessPreset: MembershipAccessPresetV1;
      readonly deniedDatasetIds: readonly string[];
    }
  | { readonly allowed: false; readonly code: AgentTurnProblemCodeV1 };

export interface AgentAuthorityInputV1 {
  readonly context: IamTenantContextV1;
  /** Undefined is the request/member admission; a descriptor is always registry-owned. */
  readonly descriptor?: AgentToolDescriptorV1;
  readonly datasetIds: readonly string[];
  readonly input?: Readonly<Record<string, unknown>>;
  readonly confirmationPresent?: boolean;
}

/** IAM-owned adapter boundary; no browser-selected level or action is accepted here. */
export interface AgentAuthorityPortV1 {
  authorize(input: AgentAuthorityInputV1): Promise<AgentAuthorityDecisionV1>;
}

export interface AgentIamActionAuthorizationInputV1 {
  readonly context: IamTenantContextV1;
  /** The descriptor must be resolved from AgentToolRegistryV1 by the caller. */
  readonly descriptor: AgentToolDescriptorV1;
  readonly resourceIds: readonly string[];
}

export type AgentIamActionAuthorizationDecisionV1 =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: 'UNAUTHORIZED' };

/** Narrow server-owned IAM action gate. Agent grants never substitute for this port. */
export interface AgentIamActionAuthorizationPortV1 {
  authorize(
    input: AgentIamActionAuthorizationInputV1,
  ): Promise<AgentIamActionAuthorizationDecisionV1>;
}

export class FailClosedAgentIamActionAuthorizationAdapter
  implements AgentIamActionAuthorizationPortV1
{
  public authorize(): Promise<AgentIamActionAuthorizationDecisionV1> {
    return Promise.resolve(Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const }));
  }
}

export interface AgentUsageAdmissionInputV1 {
  readonly context: IamTenantContextV1;
  readonly descriptor?: AgentToolDescriptorV1;
  readonly costClass: AgentToolCostClassV1;
  readonly correlationId: string;
}

export type AgentUsageAdmissionV1 =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: 'BUDGET_DENIED' };

/** BUA-owned admission boundary; tool execution must follow a successful admission. */
export interface AgentUsagePortV1 {
  admit(input: AgentUsageAdmissionInputV1): Promise<AgentUsageAdmissionV1>;
}

export interface AgentToolExecutorInputV1 {
  readonly context: IamTenantContextV1;
  readonly descriptor: AgentToolDescriptorV1;
  readonly input: Readonly<Record<string, unknown>>;
  readonly authority: Extract<AgentAuthorityDecisionV1, { readonly allowed: true }>;
  readonly correlationId: string;
}

/** Typed DDA application-service gateway; it never receives a database client or raw query. */
export interface AgentToolExecutorPortV1 {
  execute(input: AgentToolExecutorInputV1): Promise<AgentToolExecutionResultV1>;
}

export class FailClosedAgentAuthorityAdapter implements AgentAuthorityPortV1 {
  public authorize(): Promise<AgentAuthorityDecisionV1> {
    return Promise.resolve(Object.freeze({ allowed: false, code: 'UNAUTHORIZED' as const }));
  }
}

export class FailClosedAgentUsageAdapter implements AgentUsagePortV1 {
  public admit(): Promise<AgentUsageAdmissionV1> {
    return Promise.resolve(Object.freeze({ allowed: false, code: 'BUDGET_DENIED' as const }));
  }
}

export class FailClosedAgentToolExecutorAdapter implements AgentToolExecutorPortV1 {
  public execute(): Promise<AgentToolExecutionResultV1> {
    return Promise.resolve(Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const }));
  }
}

export type { AgentToolExecutionResultV1 } from './agent-tool.types.js';
