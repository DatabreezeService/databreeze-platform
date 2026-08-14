import type { DdaDashboardAuthoringCommand } from '@databreeze/contracts/v3';
import type { DdaAnalysisPlanV1 } from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { AnalysisProposalServiceV1 } from '../../analyst/application/analysis-proposal.service.js';
import type { DeterministicResultPortV1 } from '../../analyst/application/deterministic-result.port.js';
import type { DdaAudComposePortV1 } from '../../application/foundation-ports.js';
import type { DashboardDraftServiceV1 } from '../../dashboard/application/dashboard-draft.service.js';
import type { DashboardProposalServiceV1 } from '../../dashboard/application/dashboard-proposal.service.js';
import type { AgentAuthorityPortV1 } from './agent-runtime.port.js';
import type { AgentToolRegistryV1 } from './agent-tool-registry.js';
import type { AgentIamActionAuthorizationPortV1 } from './agent-runtime.port.js';
import type { AgentConsequentialCommandPortV1 } from './agent-consequential-command.port.js';

export const TYPED_AGENT_TOOL_EXECUTOR_DEPENDENCIES_PORT = Symbol(
  'TYPED_AGENT_TOOL_EXECUTOR_DEPENDENCIES_PORT',
);

export type AgentDependencyFailureCodeV1 =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'STALE_INPUT';

export type AgentDependencyResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AgentDependencyFailureCodeV1 };

export interface AgentDatasetReaderPortV1 {
  describe(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
  sample(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly limit: number;
    readonly columns: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
}

export interface AgentAnalysisPlanInputPortV1 {
  /** Resolves a complete typed proposal input from server-owned catalog metadata. */
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly question: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<Readonly<Record<string, unknown>>>>;
}

export interface AgentAnalysisPlanResolverPortV1 {
  /** Resolves an immutable plan plus its canonical logical dataset/version binding. */
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly planId: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<AgentResolvedAnalysisPlanV1>>;
}

export interface AgentResolvedAnalysisPlanV1 {
  readonly plan: DdaAnalysisPlanV1;
  readonly datasetId: string;
}

export interface AgentDashboardPreviewCommandV1 {
  readonly previewCommandId: string;
  readonly expectedVersion: number;
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly dashboardId: string;
  readonly command: DdaDashboardAuthoringCommand;
  readonly datasetIds?: readonly string[];
}

export interface AgentDashboardPreviewPortV1 {
  /** Returns a server-created command; callers cannot submit a command body to this port. */
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly previewCommandId: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<AgentDashboardPreviewCommandV1>>;
}

export interface AgentDashboardValuePortV1 {
  explainValue(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId: string;
    readonly widgetId: string;
    readonly cellId?: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
}

export interface AgentEvidenceResolverPortV1 {
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly evidenceId: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
}

export interface AgentSourceOpenPortV1 {
  open(input: {
    readonly context: IamTenantContextV1;
    readonly sourceId: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
}

export interface AgentEtlCorrectionPortV1 {
  proposeCorrection(input: {
    readonly context: IamTenantContextV1;
    readonly datasetId: string;
    readonly issueId: string;
    readonly correction: string;
    readonly signal: AbortSignal;
  }): Promise<AgentDependencyResultV1<unknown>>;
}

export interface TypedAgentToolExecutorDependenciesV1 {
  readonly registry: AgentToolRegistryV1;
  readonly authority: AgentAuthorityPortV1;
  /** Fresh IAM action authorization; omitted composition fails closed. */
  readonly iamActionAuthorization?: AgentIamActionAuthorizationPortV1;
  /** Durable reserve/commit/replay and mutation audit boundary. */
  readonly consequentialCommand?: AgentConsequentialCommandPortV1;
  readonly dataset?: AgentDatasetReaderPortV1;
  readonly analysisPlanInput?: AgentAnalysisPlanInputPortV1;
  readonly analysisProposalService?: Pick<AnalysisProposalServiceV1, 'propose'>;
  readonly analysisPlanResolver?: AgentAnalysisPlanResolverPortV1;
  readonly deterministicResults?: DeterministicResultPortV1;
  readonly dashboardProposalService?: Pick<DashboardProposalServiceV1, 'propose'>;
  readonly dashboardPreview?: AgentDashboardPreviewPortV1;
  readonly dashboardDraftService?: Pick<DashboardDraftServiceV1, 'applyAuthoringCommand'>;
  readonly dashboardValue?: AgentDashboardValuePortV1;
  readonly evidence?: AgentEvidenceResolverPortV1;
  readonly source?: AgentSourceOpenPortV1;
  readonly etl?: AgentEtlCorrectionPortV1;
  readonly audit?: DdaAudComposePortV1;
}

export class UnavailableAgentDatasetReaderPortV1 implements AgentDatasetReaderPortV1 {
  public describe(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }

  public sample(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentAnalysisPlanInputPortV1 implements AgentAnalysisPlanInputPortV1 {
  public resolve(): Promise<AgentDependencyResultV1<Readonly<Record<string, unknown>>>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentAnalysisPlanResolverPortV1 implements AgentAnalysisPlanResolverPortV1 {
  public resolve(): Promise<AgentDependencyResultV1<AgentResolvedAnalysisPlanV1>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentDashboardPreviewPortV1 implements AgentDashboardPreviewPortV1 {
  public resolve(): Promise<AgentDependencyResultV1<AgentDashboardPreviewCommandV1>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentDashboardValuePortV1 implements AgentDashboardValuePortV1 {
  public explainValue(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentEvidenceResolverPortV1 implements AgentEvidenceResolverPortV1 {
  public resolve(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentSourceOpenPortV1 implements AgentSourceOpenPortV1 {
  public open(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}

export class UnavailableAgentEtlCorrectionPortV1 implements AgentEtlCorrectionPortV1 {
  public proposeCorrection(): Promise<AgentDependencyResultV1<unknown>> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}
