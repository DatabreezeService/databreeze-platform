import type { AgentGrantLevelV1 } from '@databreeze/domain/permissions/v1';
import type { PermissionV1 } from '@databreeze/domain/permissions/v1';

export const AGENT_TOOL_NAMES_V1 = Object.freeze([
  'dataset.describe',
  'dataset.sample',
  'analysis.plan',
  'analysis.execute',
  'dashboard.propose',
  'dashboard.applyConfirmed',
  'dashboard.explainValue',
  'evidence.resolve',
  'source.open',
  'etl.proposeCorrection',
] as const);

export type AgentToolNameV1 = (typeof AGENT_TOOL_NAMES_V1)[number];

export type AgentToolCostClassV1 = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type AgentToolSideEffectClassV1 = 'READ' | 'PROPOSAL' | 'MUTATION';
export type AgentToolAuditPolicyV1 = 'REQUIRED';

export interface AgentToolSchemaV1 {
  readonly schemaId: string;
  readonly properties: readonly string[];
  readonly requiredProperties: readonly string[];
}

export interface AgentToolDescriptorV1 {
  readonly name: AgentToolNameV1;
  readonly requiredAgentLevel: AgentGrantLevelV1;
  readonly requiredIamAction: PermissionV1;
  readonly inputSchema: AgentToolSchemaV1;
  readonly outputSchema: AgentToolSchemaV1;
  readonly maximumRows: number;
  readonly maximumBytes: number;
  readonly costClass: AgentToolCostClassV1;
  readonly sideEffectClass: AgentToolSideEffectClassV1;
  readonly timeoutMs: number;
  readonly auditPolicy: AgentToolAuditPolicyV1;
  readonly requiresUserConfirmation: boolean;
}

export type AgentTurnProblemCodeV1 =
  | 'UNKNOWN_TOOL'
  | 'INSUFFICIENT_AGENT_LEVEL'
  | 'DATASET_RESTRICTED'
  | 'OVER_BOUND_SAMPLE'
  | 'STALE_CONTEXT'
  | 'BUDGET_DENIED'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_TIMEOUT'
  | 'MALFORMED_TOOL_CALL'
  | 'TOOL_LOOP_LIMIT'
  | 'REPEATED_TOOL_CALL'
  | 'EVIDENCE_UNAUTHORIZED'
  | 'UNCONFIRMED_DASHBOARD_APPLY'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNAUTHORIZED'
  | 'CONVERSATION_NOT_FOUND'
  | 'PROVIDER_FAILURE';

export type AgentResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AgentTurnProblemCodeV1 };

export interface AgentDatasetBindingV1 {
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly label: string;
  readonly schemaFingerprint: string;
}

export interface AgentRecentMessageV1 {
  readonly messageId: string;
  readonly role: 'USER' | 'AGENT' | 'SYSTEM';
  readonly text: string;
}

export interface AgentEvidenceRefV1 {
  readonly evidenceId: string;
  readonly kind: 'RESULT_CELL' | 'SOURCE' | 'EXTRACTION';
}

export interface AgentContextPackageV1 {
  readonly systemPolicy: string;
  readonly workspacePolicyProjection: {
    readonly accessPreset: string;
    readonly deniedDatasetIds: readonly string[];
  };
  readonly datasetBindings: readonly AgentDatasetBindingV1[];
  readonly recentMessages: readonly AgentRecentMessageV1[];
  readonly summaryText: string;
  readonly evidenceRefs: readonly AgentEvidenceRefV1[];
  readonly dashboardContext?: { readonly dashboardId: string };
  readonly filterContext?: string;
  readonly locale: string;
  readonly estimatedProviderTokenCeiling: 24_000;
  readonly agentLevel: AgentGrantLevelV1;
}

export interface AgentProviderToolCallV1 {
  readonly toolCallId: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface AgentProviderCompletionV1 {
  readonly narrative: string;
  readonly toolCalls: readonly AgentProviderToolCallV1[];
}

export type AgentToolExecutionResultV1 = AgentResultV1<unknown>;
