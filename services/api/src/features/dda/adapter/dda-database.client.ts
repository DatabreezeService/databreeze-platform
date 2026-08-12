import type { DdaAnalysisPlanDatabaseClientV1 } from './prisma-analysis-plan-repository.adapter.js';
import type { DdaDashboardDatabaseClientV1 } from './prisma-dashboard-repository.adapter.js';
import type { DdaRefreshDatabaseClientV1 } from './prisma-refresh-repository.adapter.js';
import type { DdaDashboardDraftDatabaseClientV1 } from '../dashboard/adapter/prisma-dashboard-draft-repository.adapter.js';
import type { DdaEtlProposalDatabaseClientV1 } from '../etl/adapter/prisma-etl-proposal-repository.adapter.js';
import type { DdaDependencyDatabaseClientV1 } from '../refresh/adapter/prisma-dependency-repository.adapter.js';

/** Narrow metadata-only unified workspace delegates (no ORM import in the feature). */
export interface DdaUnifiedWorkspaceDatabaseClientV1 {
  readonly ddaDatasetSource: unknown;
  readonly ddaSourceAssignment: unknown;
  readonly ddaFolderPlacementReview: unknown;
  readonly ddaFolderMoveReceipt: unknown;
  readonly ddaConversation: unknown;
  readonly ddaConversationMessage: unknown;
  readonly ddaConversationContextEvent: unknown;
  readonly ddaConversationSummary: unknown;
  readonly ddaExtractionCandidate: unknown;
  readonly ddaNamedDashboardView: unknown;
}

/** Narrow metadata-only DDA persistence surface (no ORM client import in the feature). */
export type DdaDatabaseClientV1 = DdaDashboardDatabaseClientV1 &
  DdaAnalysisPlanDatabaseClientV1 &
  DdaRefreshDatabaseClientV1 &
  DdaEtlProposalDatabaseClientV1 &
  DdaDashboardDraftDatabaseClientV1 &
  DdaDependencyDatabaseClientV1 &
  Partial<DdaUnifiedWorkspaceDatabaseClientV1>;
