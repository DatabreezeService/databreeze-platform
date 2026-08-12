import type {
  AgentProviderCompleteInputV1,
  AgentProviderPortV1,
} from '../application/agent-provider.port.js';
import type { AgentProviderCompletionV1, AgentResultV1 } from '../application/agent-tool.types.js';

/**
 * OpenAI-backed agent provider adapter.
 * Remains fail-closed unless an owner-enabled client is injected.
 * Never accepts live credentials from tests or default composition.
 */
export class OpenAiAgentProviderAdapter implements AgentProviderPortV1 {
  public constructor(
    private readonly options: {
      readonly enabled: boolean;
      readonly complete?: (
        input: AgentProviderCompleteInputV1,
      ) => Promise<AgentResultV1<AgentProviderCompletionV1>>;
    },
  ) {}

  public async completeTurn(
    input: AgentProviderCompleteInputV1,
  ): Promise<AgentResultV1<AgentProviderCompletionV1>> {
    if (!this.options.enabled || this.options.complete === undefined) {
      return Object.freeze({ accepted: false, code: 'PROVIDER_DISABLED' });
    }
    // Reject executable / credential-shaped payload keys if a future transport adds them.
    const hostile = JSON.stringify(input.contextPackage);
    if (
      hostile.includes('"databaseClient"') ||
      hostile.includes('"storageCredential"') ||
      hostile.includes('"localPath"')
    ) {
      return Object.freeze({ accepted: false, code: 'PROVIDER_FAILURE' });
    }
    return this.options.complete(input);
  }
}
