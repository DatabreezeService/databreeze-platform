import {
  createDataModePolicyVersionV1,
  isDataModePayloadAllowedV1,
  type DataModePolicyVersionV1,
} from '@databreeze/domain/data-mode/v1';
import {
  parseStableIdentifierV1,
  tenantScopesEqualV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import {
  createExecutionRouteDecisionV1,
  createExecutionRouteSubjectV1,
  executionRouteDecisionSubjectHashV1,
  type ExecutionRouteDecisionV1,
  type ExecutionRouteSubjectInputV1,
  type ExecutionRouteSubjectV1,
} from './execution-route-decision.js';
import type { ExecutionRouteWorkspacePolicyAuthorityPortV1 } from './execution-route-policy-authority.port.js';
import type { ExecutionRouteRepositoryPortV1 } from './execution-route-repository.port.js';

export const EXECUTION_ROUTE_AUTHORITY_PORT = Symbol('EXECUTION_ROUTE_AUTHORITY_PORT');

export type ExecutionRouteErrorCodeV1 =
  | 'INVALID_ROUTE_DECISION'
  | 'SCOPE_MISMATCH'
  | 'DATA_MODE_POLICY_UNAVAILABLE'
  | 'DATA_MODE_POLICY_STALE'
  | 'AUTHORIZATION_EPOCH_STALE'
  | 'ROUTE_NOT_ALLOWED'
  | 'ROUTE_NOT_FOUND'
  | 'ROUTE_SUBJECT_MISMATCH'
  | 'ROUTE_EXPIRED'
  | 'IMMUTABLE_ROUTE_DECISION'
  | 'PERSISTENCE_UNAVAILABLE';

export type ExecutionRouteResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: ExecutionRouteErrorCodeV1 };

export interface ExecutionRouteClockPortV1 {
  now(): string;
}

export class SystemExecutionRouteClock implements ExecutionRouteClockPortV1 {
  public now(): string {
    return new Date().toISOString();
  }
}

export interface ExecutionRouteAuthorizeInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly decisionId: string;
  readonly subject: ExecutionRouteSubjectInputV1;
  readonly expectedDecisionSubjectHash: string;
  readonly currentAuthorizationEpoch: number;
}

export interface ExecutionRouteAuthorityPortV1 {
  authorize(
    input: ExecutionRouteAuthorizeInputV1,
  ): Promise<ExecutionRouteResultV1<ExecutionRouteDecisionV1>>;
}

function rejected<TValue>(code: ExecutionRouteErrorCodeV1): ExecutionRouteResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

function policyAllows(subject: ExecutionRouteSubjectV1, policy: DataModePolicyVersionV1): boolean {
  if (
    subject.tenantScope.scopeType === 'organization' ||
    policy.organizationId !== subject.tenantScope.organizationId ||
    policy.workspaceId !== subject.tenantScope.workspaceId ||
    subject.input.placementAvailable !== true ||
    !isDataModePayloadAllowedV1(policy, subject.input.classification, subject.input.payloadClass) ||
    !policy.allowedPlacementKinds.includes(subject.input.placementKind) ||
    !policy.allowedExecutorClasses.includes(subject.target.executorClass) ||
    subject.action.requiredCapabilities.some(
      (capability) => !subject.target.grantedCapabilities.includes(capability),
    )
  )
    return false;
  for (const constraint of subject.narrowingConstraints) {
    if (
      !constraint.allowedClassifications.includes(subject.input.classification) ||
      !constraint.allowedPayloadClasses.includes(subject.input.payloadClass) ||
      !constraint.allowedPlacementKinds.includes(subject.input.placementKind) ||
      !constraint.allowedExecutorClasses.includes(subject.target.executorClass)
    )
      return false;
  }
  if (subject.target.target === 'CLOUD')
    return (
      policy.mode !== 'LOCAL' &&
      subject.input.dataMode !== 'Local' &&
      subject.input.placementKind === 'CLOUD' &&
      subject.target.executorClass === 'CLOUD'
    );
  return subject.target.executorClass !== 'CLOUD';
}

function parseCurrentPolicy(value: DataModePolicyVersionV1): DataModePolicyVersionV1 | undefined {
  const parsed = createDataModePolicyVersionV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

/** DSO-024/026/027: durable, expiring route authority; it never creates a JRA Job. */
export class ExecutionRouteService implements ExecutionRouteAuthorityPortV1 {
  public constructor(
    private readonly repository: ExecutionRouteRepositoryPortV1,
    private readonly policies: ExecutionRouteWorkspacePolicyAuthorityPortV1,
    private readonly clock: ExecutionRouteClockPortV1 = new SystemExecutionRouteClock(),
  ) {}

  private async currentPolicy(
    tenantScope: TenantScopeV1,
  ): Promise<
    { readonly policy: DataModePolicyVersionV1; readonly authorizationEpoch: number } | undefined
  > {
    if (tenantScope.scopeType === 'organization') return undefined;
    try {
      const resolved = await this.policies.resolveCurrentWorkspacePolicy({
        organizationId: tenantScope.organizationId,
        workspaceId: tenantScope.workspaceId,
      });
      if (
        resolved === undefined ||
        !Number.isSafeInteger(resolved.authorizationEpoch) ||
        resolved.authorizationEpoch < 0
      )
        return undefined;
      const policy = parseCurrentPolicy(resolved.policy);
      return policy === undefined
        ? undefined
        : { policy, authorizationEpoch: resolved.authorizationEpoch };
    } catch {
      return undefined;
    }
  }

  public async createDecision(
    context: IamTenantContextV1,
    input: {
      readonly routeId: string;
      readonly decisionId: string;
      readonly revision: number;
      readonly subject: ExecutionRouteSubjectInputV1;
      readonly expiresAt: string;
    },
  ): Promise<ExecutionRouteResultV1<ExecutionRouteDecisionV1>> {
    const subject = createExecutionRouteSubjectV1(input.subject);
    if (!subject.accepted) return rejected('INVALID_ROUTE_DECISION');
    if (!tenantScopesEqualV1(context.tenantScope, subject.value.tenantScope))
      return rejected('SCOPE_MISMATCH');
    if (
      context.authorizationEpoch !== subject.value.authorizationEpoch ||
      context.tenantScope.scopeType === 'organization'
    )
      return rejected('AUTHORIZATION_EPOCH_STALE');
    const current = await this.currentPolicy(context.tenantScope);
    if (current === undefined) return rejected('DATA_MODE_POLICY_UNAVAILABLE');
    if (current.authorizationEpoch !== context.authorizationEpoch)
      return rejected('AUTHORIZATION_EPOCH_STALE');
    if (!policyAllows(subject.value, current.policy)) return rejected('ROUTE_NOT_ALLOWED');
    const decision = createExecutionRouteDecisionV1({
      routeId: input.routeId,
      decisionId: input.decisionId,
      revision: input.revision,
      subject: subject.value,
      policy: current.policy,
      createdAt: this.clock.now(),
      expiresAt: input.expiresAt,
    });
    if (!decision.accepted) return rejected('INVALID_ROUTE_DECISION');
    try {
      await this.repository.save(decision.value);
      return Object.freeze({ accepted: true, value: decision.value });
    } catch (error) {
      return rejected(
        error instanceof Error && error.message.includes('IMMUTABLE')
          ? 'IMMUTABLE_ROUTE_DECISION'
          : 'PERSISTENCE_UNAVAILABLE',
      );
    }
  }

  public async authorize(
    input: ExecutionRouteAuthorizeInputV1,
  ): Promise<ExecutionRouteResultV1<ExecutionRouteDecisionV1>> {
    const decisionId = parseStableIdentifierV1(input.decisionId);
    if (!decisionId.accepted) return rejected('ROUTE_NOT_FOUND');
    let decision: ExecutionRouteDecisionV1 | undefined;
    try {
      decision = await this.repository.findExact({
        tenantScope: input.tenantScope,
        decisionId: decisionId.value,
      });
    } catch {
      return rejected('PERSISTENCE_UNAVAILABLE');
    }
    if (decision === undefined) return rejected('ROUTE_NOT_FOUND');
    const subject = createExecutionRouteSubjectV1(input.subject);
    if (!subject.accepted || !tenantScopesEqualV1(subject.value.tenantScope, input.tenantScope))
      return rejected('ROUTE_SUBJECT_MISMATCH');
    const subjectHash = executionRouteDecisionSubjectHashV1(subject.value);
    if (
      !/^[a-f0-9]{64}$/u.test(input.expectedDecisionSubjectHash) ||
      input.expectedDecisionSubjectHash !== decision.decisionSubjectHash ||
      subjectHash !== decision.decisionSubjectHash ||
      JSON.stringify(subject.value) !==
        JSON.stringify({
          tenantScope: decision.tenantScope,
          input: decision.input,
          action: decision.action,
          target: decision.target,
          narrowingConstraints: decision.narrowingConstraints,
          authorizationEpoch: decision.authorizationEpoch,
        })
    )
      return rejected('ROUTE_SUBJECT_MISMATCH');
    if (
      !Number.isSafeInteger(input.currentAuthorizationEpoch) ||
      input.currentAuthorizationEpoch !== decision.authorizationEpoch
    )
      return rejected('AUTHORIZATION_EPOCH_STALE');
    if (Date.parse(this.clock.now()) >= Date.parse(decision.expiresAt))
      return rejected('ROUTE_EXPIRED');
    const current = await this.currentPolicy(input.tenantScope);
    if (current === undefined) return rejected('DATA_MODE_POLICY_UNAVAILABLE');
    if (
      current.authorizationEpoch !== input.currentAuthorizationEpoch ||
      current.authorizationEpoch !== decision.authorizationEpoch
    )
      return rejected('AUTHORIZATION_EPOCH_STALE');
    if (
      current.policy.policyId !== decision.dataModePolicyId ||
      current.policy.policyVersionId !== decision.dataModePolicyVersionId ||
      current.policy.revision !== decision.dataModePolicyRevision ||
      current.policy.canonicalHash !== decision.dataModePolicyHash
    )
      return rejected('DATA_MODE_POLICY_STALE');
    if (!policyAllows(subject.value, current.policy)) return rejected('ROUTE_NOT_ALLOWED');
    return Object.freeze({ accepted: true, value: decision });
  }
}
