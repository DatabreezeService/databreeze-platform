import { createHash } from 'node:crypto';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

import type { AgentToolDescriptorV1, AgentToolExecutionResultV1 } from './agent-tool.types.js';

export const AGENT_CONSEQUENTIAL_COMMAND_PORT = Symbol('AGENT_CONSEQUENTIAL_COMMAND_PORT');

export type AgentCommandAuditOutcomeV1 = 'ATTEMPTED' | 'SUCCEEDED';

export interface AgentConsequentialCommandInputV1 {
  readonly context: IamTenantContextV1;
  readonly descriptor: AgentToolDescriptorV1;
  readonly input: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  /** Canonical input fingerprint, independent of object insertion order. */
  readonly inputFingerprint: string;
  readonly correlationId: string;
  /** The durable implementation owns reserve/commit/replay around these callbacks. */
  readonly audit: (outcome: AgentCommandAuditOutcomeV1) => Promise<boolean>;
  readonly perform: () => Promise<AgentToolExecutionResultV1>;
}

export interface AgentConsequentialCommandReconciliationInputV1 {
  readonly context: IamTenantContextV1;
  readonly descriptor: AgentToolDescriptorV1;
  readonly input: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly audit: (outcome: AgentCommandAuditOutcomeV1) => Promise<boolean>;
  readonly outcome:
    | { readonly state: 'FAILED'; readonly failureCode: string }
    | { readonly state: 'COMMITTED'; readonly result: AgentToolExecutionResultV1 };
}

/**
 * Explicit owner-driven closure for a reservation whose side-effect outcome was unknown.
 * Implementations must never infer COMMITTED from a timeout or process restart.
 */
export interface AgentConsequentialCommandReconciliationPortV1 {
  reconcile(
    input: AgentConsequentialCommandReconciliationInputV1,
  ): Promise<AgentToolExecutionResultV1>;
}

/**
 * Durable command boundary for consequential mutations.
 *
 * Implementations must atomically bind tenant, actor, tool, idempotency key, and fingerprint;
 * reserve once; audit before the side effect; commit the result; and replay a committed result.
 * A pending/restarted command must never run the side effect a second time. An unavailable or
 * unreconciled implementation must fail closed.
 */
export interface AgentConsequentialCommandPortV1 {
  execute(input: AgentConsequentialCommandInputV1): Promise<AgentToolExecutionResultV1>;
}

export class FailClosedAgentConsequentialCommandAdapter implements AgentConsequentialCommandPortV1 {
  public execute(): Promise<AgentToolExecutionResultV1> {
    return Promise.resolve(Object.freeze({ accepted: false, code: 'PROVIDER_FAILURE' as const }));
  }
}

export class FailClosedAgentConsequentialCommandReconciliationAdapter
  implements AgentConsequentialCommandReconciliationPortV1
{
  public reconcile(): Promise<AgentToolExecutionResultV1> {
    return Promise.resolve(Object.freeze({ accepted: false, code: 'PROVIDER_FAILURE' as const }));
  }
}

export function canonicalAgentInputFingerprintV1(input: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(stableSerialize(input)).digest('hex');
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(',')}}`;
}
