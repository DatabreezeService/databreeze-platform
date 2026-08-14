import type {
  AgentGrantApplicationCodeV1,
  AgentGrantAuthorizationDecisionV1,
  AgentGrantService,
} from '../../../iam/application/agent-grant.service.js';
import type { AgentAuthorityPortV1 } from '../application/agent-runtime.port.js';
import type {
  AgentAuthorityDecisionV1,
  AgentAuthorityInputV1,
} from '../application/agent-runtime.port.js';
import type {
  AgentToolDescriptorV1,
  AgentTurnProblemCodeV1,
} from '../application/agent-tool.types.js';

export type IamAgentGrantAuthorizationPortV1 = Pick<AgentGrantService, 'authorize'>;

function rejected(code: AgentTurnProblemCodeV1): AgentAuthorityDecisionV1 {
  return Object.freeze({ allowed: false, code });
}

function mapIamFailure(
  code: AgentGrantApplicationCodeV1,
  hasResourceIds: boolean,
): AgentAuthorityDecisionV1 {
  // AgentGrantService intentionally uses NOT_FOUND for restricted resources.
  if (code === 'NOT_FOUND' && hasResourceIds) return rejected('DATASET_RESTRICTED');
  return rejected('UNAUTHORIZED');
}

function mapDecision(
  descriptor: AgentToolDescriptorV1 | undefined,
  decision: AgentGrantAuthorizationDecisionV1,
): AgentAuthorityDecisionV1 {
  if (!decision.allowed) {
    if (decision.requiresConfirmation) return rejected('UNCONFIRMED_DASHBOARD_APPLY');
    const requestedLevel = descriptor?.requiredAgentLevel ?? 'ANALYZE';
    if (decision.effectiveLevel !== requestedLevel) {
      return rejected('INSUFFICIENT_AGENT_LEVEL');
    }
    return rejected('UNAUTHORIZED');
  }

  return Object.freeze({
    allowed: true,
    effectiveAgentLevel: decision.effectiveLevel,
    accessPreset: decision.accessPreset,
    deniedDatasetIds: Object.freeze([...(decision.deniedDatasetIds ?? [])]),
  });
}

/** IAM-024/025: resolves agent authority from the authenticated actor and registry descriptor. */
export class IamAgentAuthorityAdapter implements AgentAuthorityPortV1 {
  public constructor(private readonly grants: IamAgentGrantAuthorizationPortV1) {}

  public async authorize(input: AgentAuthorityInputV1): Promise<AgentAuthorityDecisionV1> {
    const requestedLevel = input.descriptor?.requiredAgentLevel ?? 'ANALYZE';
    const result = await this.callAuthorize(input, requestedLevel, input.datasetIds);
    if (!result.accepted) return mapIamFailure(result.code, input.datasetIds.length > 0);
    if (
      input.datasetIds.some((datasetId) =>
        (result.value.deniedDatasetIds ?? []).some(
          (deniedDatasetId) => deniedDatasetId === datasetId,
        ),
      )
    ) {
      return rejected('DATASET_RESTRICTED');
    }
    return mapDecision(input.descriptor, result.value);
  }

  private async callAuthorize(
    input: AgentAuthorityInputV1,
    requestedLevel: AgentGrantAuthorizationDecisionV1['effectiveLevel'],
    resourceIds: readonly string[],
  ): Promise<Awaited<ReturnType<AgentGrantService['authorize']>>> {
    try {
      return await this.grants.authorize({
        context: input.context,
        // The actor is the authenticated member/principal; no browser member id exists here.
        memberId: input.context.actorId,
        requestedLevel,
        resourceIds,
        ...(input.confirmationPresent === undefined
          ? {}
          : { confirmationPresent: input.confirmationPresent }),
      });
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}
