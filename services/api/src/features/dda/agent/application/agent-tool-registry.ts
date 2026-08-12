import { PERMISSIONS_V1, type AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';

import {
  AGENT_TOOL_NAMES_V1,
  type AgentResultV1,
  type AgentToolDescriptorV1,
  type AgentToolNameV1,
} from './agent-tool.types.js';

function descriptor(
  name: AgentToolNameV1,
  requiredAgentLevel: AgentGrantLevelV1,
  requiredIamAction: AgentToolDescriptorV1['requiredIamAction'],
  options: {
    readonly maximumRows: number;
    readonly maximumBytes: number;
    readonly costClass: AgentToolDescriptorV1['costClass'];
    readonly sideEffectClass: AgentToolDescriptorV1['sideEffectClass'];
    readonly timeoutMs: number;
    readonly requiresUserConfirmation?: boolean;
  },
): AgentToolDescriptorV1 {
  return Object.freeze({
    name,
    requiredAgentLevel,
    requiredIamAction,
    maximumRows: options.maximumRows,
    maximumBytes: options.maximumBytes,
    costClass: options.costClass,
    sideEffectClass: options.sideEffectClass,
    timeoutMs: options.timeoutMs,
    auditPolicy: 'REQUIRED',
    requiresUserConfirmation: options.requiresUserConfirmation === true,
  });
}

const DESCRIPTORS: ReadonlyMap<AgentToolNameV1, AgentToolDescriptorV1> = new Map(
  [
    descriptor('dataset.describe', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      maximumRows: 1,
      maximumBytes: 32_768,
      costClass: 'NONE',
      sideEffectClass: 'READ',
      timeoutMs: 5_000,
    }),
    descriptor('dataset.sample', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      maximumRows: 50,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('analysis.plan', 'ANALYZE', PERMISSIONS_V1.PROJECT_RECORD_READ, {
      maximumRows: 1,
      maximumBytes: 32_768,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 15_000,
    }),
    descriptor('analysis.execute', 'ANALYZE', PERMISSIONS_V1.JOB_EXECUTION_RUN, {
      maximumRows: 500,
      maximumBytes: 262_144,
      costClass: 'MEDIUM',
      sideEffectClass: 'READ',
      timeoutMs: 30_000,
    }),
    descriptor('dashboard.propose', 'PROPOSE_CHANGES', PERMISSIONS_V1.PROJECT_RECORD_MANAGE, {
      maximumRows: 4,
      maximumBytes: 65_536,
      costClass: 'MEDIUM',
      sideEffectClass: 'PROPOSAL',
      timeoutMs: 20_000,
    }),
    descriptor('dashboard.applyConfirmed', 'APPLY_CONFIRMED_CHANGES', PERMISSIONS_V1.PROJECT_RECORD_MANAGE, {
      maximumRows: 1,
      maximumBytes: 32_768,
      costClass: 'HIGH',
      sideEffectClass: 'MUTATION',
      timeoutMs: 20_000,
      requiresUserConfirmation: true,
    }),
    descriptor('dashboard.explainValue', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      maximumRows: 20,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('evidence.resolve', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      maximumRows: 1,
      maximumBytes: 131_072,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('source.open', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      maximumRows: 1,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('etl.proposeCorrection', 'PROPOSE_CHANGES', PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE, {
      maximumRows: 1,
      maximumBytes: 65_536,
      costClass: 'MEDIUM',
      sideEffectClass: 'PROPOSAL',
      timeoutMs: 20_000,
    }),
  ].map((item) => [item.name, item] as const),
);

/** DDA-060: closed server-owned tool descriptors. */
export class AgentToolRegistryV1 {
  public listNames(): readonly AgentToolNameV1[] {
    return AGENT_TOOL_NAMES_V1;
  }

  public resolve(name: string): AgentResultV1<AgentToolDescriptorV1> {
    const descriptor = DESCRIPTORS.get(name as AgentToolNameV1);
    if (!descriptor) {
      return Object.freeze({ accepted: false, code: 'UNKNOWN_TOOL' });
    }
    return Object.freeze({ accepted: true, value: descriptor });
  }
}

export { AGENT_TOOL_NAMES_V1 };
