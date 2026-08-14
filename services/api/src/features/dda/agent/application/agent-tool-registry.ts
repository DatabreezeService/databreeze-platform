import { PERMISSIONS_V1, type AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';

import {
  AGENT_TOOL_NAMES_V1,
  type AgentResultV1,
  type AgentToolDescriptorV1,
  type AgentToolNameV1,
  type AgentToolSchemaV1,
} from './agent-tool.types.js';

function schema(
  schemaId: string,
  properties: readonly string[],
  requiredProperties: readonly string[],
): AgentToolSchemaV1 {
  return Object.freeze({
    schemaId,
    properties: Object.freeze([...properties]),
    requiredProperties: Object.freeze([...requiredProperties]),
  });
}

function descriptor(
  name: AgentToolNameV1,
  requiredAgentLevel: AgentGrantLevelV1,
  requiredIamAction: AgentToolDescriptorV1['requiredIamAction'],
  options: {
    readonly inputProperties: readonly string[];
    readonly requiredInputProperties: readonly string[];
    readonly outputProperties: readonly string[];
    readonly requiredOutputProperties: readonly string[];
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
    inputSchema: schema(
      `dda.agent.input.${name}.v1`,
      options.inputProperties,
      options.requiredInputProperties,
    ),
    outputSchema: schema(
      `dda.agent.output.${name}.v1`,
      options.outputProperties,
      options.requiredOutputProperties,
    ),
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
      inputProperties: ['datasetId'],
      requiredInputProperties: ['datasetId'],
      outputProperties: ['datasetId', 'schema', 'evidenceRefs'],
      requiredOutputProperties: ['datasetId', 'schema', 'evidenceRefs'],
      maximumRows: 1,
      maximumBytes: 32_768,
      costClass: 'NONE',
      sideEffectClass: 'READ',
      timeoutMs: 5_000,
    }),
    descriptor('dataset.sample', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      inputProperties: ['datasetId', 'limit', 'columns'],
      requiredInputProperties: ['datasetId'],
      outputProperties: ['datasetId', 'sampleId', 'columns', 'evidenceRefs'],
      requiredOutputProperties: ['datasetId', 'sampleId', 'columns', 'evidenceRefs'],
      maximumRows: 50,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('analysis.plan', 'ANALYZE', PERMISSIONS_V1.PROJECT_RECORD_READ, {
      inputProperties: ['datasetId', 'question'],
      requiredInputProperties: ['datasetId', 'question'],
      outputProperties: [
        'planId',
        'planVersionId',
        'datasetId',
        'datasetVersionId',
        'preview',
        'evidenceRefs',
      ],
      requiredOutputProperties: [
        'planId',
        'planVersionId',
        'datasetId',
        'datasetVersionId',
        'preview',
        'evidenceRefs',
      ],
      maximumRows: 1,
      maximumBytes: 32_768,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 15_000,
    }),
    descriptor('analysis.execute', 'ANALYZE', PERMISSIONS_V1.JOB_EXECUTION_RUN, {
      inputProperties: ['planId', 'datasetId', 'datasetVersionId', 'parameters'],
      requiredInputProperties: ['planId', 'datasetId', 'datasetVersionId'],
      outputProperties: ['resultId', 'evidenceRefs', 'provenance'],
      requiredOutputProperties: ['resultId', 'evidenceRefs', 'provenance'],
      maximumRows: 500,
      maximumBytes: 262_144,
      costClass: 'MEDIUM',
      sideEffectClass: 'READ',
      timeoutMs: 30_000,
    }),
    descriptor('dashboard.propose', 'PROPOSE_CHANGES', PERMISSIONS_V1.PROJECT_RECORD_MANAGE, {
      inputProperties: [
        'dashboardId',
        'question',
        'analysisPlanVersionId',
        'targetPageId',
        'targetWidgetId',
      ],
      requiredInputProperties: ['dashboardId', 'question'],
      outputProperties: ['proposalId', 'options', 'evidenceRefs'],
      requiredOutputProperties: ['proposalId', 'options', 'evidenceRefs'],
      maximumRows: 4,
      maximumBytes: 65_536,
      costClass: 'MEDIUM',
      sideEffectClass: 'PROPOSAL',
      timeoutMs: 20_000,
    }),
    descriptor(
      'dashboard.applyConfirmed',
      'APPLY_CONFIRMED_CHANGES',
      PERMISSIONS_V1.PROJECT_RECORD_MANAGE,
      {
        inputProperties: [
          'previewCommandId',
          'userConfirmation',
          'expectedVersion',
          'revision',
          'idempotencyKey',
        ],
        requiredInputProperties: [
          'previewCommandId',
          'userConfirmation',
          'expectedVersion',
          'revision',
          'idempotencyKey',
        ],
        outputProperties: ['commandId', 'revision', 'evidenceRefs'],
        requiredOutputProperties: ['commandId', 'revision', 'evidenceRefs'],
        maximumRows: 1,
        maximumBytes: 32_768,
        costClass: 'HIGH',
        sideEffectClass: 'MUTATION',
        timeoutMs: 20_000,
        requiresUserConfirmation: true,
      },
    ),
    descriptor('dashboard.explainValue', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      inputProperties: ['dashboardId', 'widgetId', 'cellId'],
      requiredInputProperties: ['dashboardId', 'widgetId'],
      outputProperties: ['explanation', 'evidenceRefs'],
      requiredOutputProperties: ['explanation', 'evidenceRefs'],
      maximumRows: 20,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('evidence.resolve', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      inputProperties: ['evidenceId'],
      requiredInputProperties: ['evidenceId'],
      outputProperties: ['evidenceId', 'kind', 'reference'],
      requiredOutputProperties: ['evidenceId', 'kind', 'reference'],
      maximumRows: 1,
      maximumBytes: 131_072,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('source.open', 'ANALYZE', PERMISSIONS_V1.ARTIFACT_RECORD_READ, {
      inputProperties: ['sourceId'],
      requiredInputProperties: ['sourceId'],
      outputProperties: ['sourceId', 'kind', 'iaeContentReferenceId', 'evidenceRefs'],
      requiredOutputProperties: ['sourceId', 'kind', 'evidenceRefs'],
      maximumRows: 1,
      maximumBytes: 65_536,
      costClass: 'LOW',
      sideEffectClass: 'READ',
      timeoutMs: 10_000,
    }),
    descriptor('etl.proposeCorrection', 'PROPOSE_CHANGES', PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE, {
      inputProperties: ['datasetId', 'issueId', 'correction'],
      requiredInputProperties: ['datasetId', 'issueId', 'correction'],
      outputProperties: ['proposalId', 'state', 'evidenceRefs'],
      requiredOutputProperties: ['proposalId', 'state', 'evidenceRefs'],
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
