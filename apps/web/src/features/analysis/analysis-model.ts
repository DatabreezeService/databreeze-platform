export type AnalysisMessageRoleV1 = 'USER' | 'AGENT' | 'SYSTEM';

export interface AnalysisDatasetContextV1 {
  readonly datasetLabel: string;
  readonly datasetVersionLabel: string;
}

export interface AnalysisConversationMessageV1 {
  readonly messageId: string;
  readonly role: AnalysisMessageRoleV1;
  readonly text: string;
  readonly createdLabel?: string;
}

/**
 * Presentation model populated only from an already-authorized workspace
 * conversation. Source values, local paths, and unrestricted history do not
 * belong in this model.
 */
export interface AnalysisConversationV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly datasetContext: readonly AnalysisDatasetContextV1[];
  readonly messages: readonly AnalysisConversationMessageV1[];
  readonly updatedLabel?: string;
}

export type AnalysisContextChangeKindV1 =
  | 'CONTEXT_RESTORED'
  | 'DATASET_VERSION_ADVANCED'
  | 'DATASET_ATTACHED'
  | 'DATASET_DETACHED'
  | 'DASHBOARD_VERSION_ADVANCED'
  | 'FILTER_CONTEXT_CHANGED';

/** DDA-056 display-only representation of a typed, recorded context event. */
export interface AnalysisContextChangeEventV1 {
  readonly eventId: string;
  readonly kind: AnalysisContextChangeKindV1;
  readonly conversationId?: string;
  readonly datasetLabel?: string;
  readonly fromVersionLabel?: string;
  readonly toVersionLabel?: string;
}

export type AnalysisLoadStateV1 = 'error' | 'loading' | 'ready';
export type AnalysisTurnErrorV1 = 'FORBIDDEN' | 'STALE_CONTEXT' | 'UNAVAILABLE' | 'USAGE_DENIED';
