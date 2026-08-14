/* eslint-disable @typescript-eslint/require-await -- disabled provider mirrors the async provider port. */

import type {
  AgentContextPackageV1,
  AgentProviderCompletionV1,
  AgentResultV1,
} from './agent-tool.types.js';

export const AGENT_PROVIDER_PORT = Symbol('AGENT_PROVIDER_PORT');

export interface AgentProviderCompleteInputV1 {
  readonly contextPackage: AgentContextPackageV1;
  readonly userText: string;
  readonly correlationId: string;
}

export interface AgentProviderPortV1 {
  completeTurn(
    input: AgentProviderCompleteInputV1,
  ): Promise<AgentResultV1<AgentProviderCompletionV1>>;
}

/** Fail-closed provider used when OpenAI assistance is disabled. */
export class DisabledAgentProviderAdapter implements AgentProviderPortV1 {
  public async completeTurn(): Promise<AgentResultV1<AgentProviderCompletionV1>> {
    return Object.freeze({ accepted: false, code: 'PROVIDER_DISABLED' });
  }
}
