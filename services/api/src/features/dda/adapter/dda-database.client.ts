import type { DdaAnalysisPlanDatabaseClientV1 } from './prisma-analysis-plan-repository.adapter.js';
import type { DdaDashboardDatabaseClientV1 } from './prisma-dashboard-repository.adapter.js';
import type { DdaRefreshDatabaseClientV1 } from './prisma-refresh-repository.adapter.js';
import type { DdaDashboardDraftDatabaseClientV1 } from '../dashboard/adapter/prisma-dashboard-draft-repository.adapter.js';
import type { DdaDashboardWorkspaceHistoryDatabaseClientV1 } from '../dashboard/adapter/prisma-dashboard-workspace-history.adapter.js';
import type { DdaDashboardProposalDatabaseClientV1 } from '../dashboard/adapter/prisma-dashboard-proposal-repository.adapter.js';
import type { DdaEtlAcceptanceCommandDatabaseClientV1 } from '../etl/adapter/prisma-etl-acceptance-command-repository.adapter.js';
import type { DdaEtlProposalDatabaseClientV1 } from '../etl/adapter/prisma-etl-proposal-repository.adapter.js';
import type { DdaDependencyDatabaseClientV1 } from '../refresh/adapter/prisma-dependency-repository.adapter.js';
import type { DdaReceiptExtractionCommandDatabaseClientV1 } from '../receipt/adapter/prisma-receipt-extraction-command-repository.adapter.js';
import type { SourceCatalogDatabaseClientV1 } from '../source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import type { DdaAgentConsequentialCommandDatabaseClientV1 } from '../agent/adapter/prisma-agent-consequential-command.adapter.js';
import type { NotificationStateV1 } from '../notification/notification-repository.port.js';

export interface DdaNotificationPreferenceSetRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DdaNotificationPreferenceRowV1 {
  readonly id: string;
  readonly setId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly category: string;
  readonly channel: string;
  readonly enabled: boolean;
  readonly minimumUrgency: string;
  readonly deliveryMode: string;
  readonly quietHours: unknown;
  readonly timezone: string;
  readonly mandatory: boolean;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DdaNotificationPreferenceCommandReceiptRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly resultDocument: unknown;
  readonly createdAt: Date;
}

export interface DdaNotificationPreferenceDatabaseClientV1 {
  readonly ddaNotificationPreferenceSet: {
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationPreferenceSetRowV1 | null>;
    create(input: {
      readonly data: DdaNotificationPreferenceSetRowV1;
    }): Promise<DdaNotificationPreferenceSetRowV1>;
    updateMany(input: {
      readonly where: Record<string, unknown>;
      readonly data: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
  };
  readonly ddaNotificationPreference: {
    findMany(input: {
      readonly where: Record<string, unknown>;
      readonly orderBy?: readonly Record<string, 'asc' | 'desc'>[];
    }): Promise<readonly DdaNotificationPreferenceRowV1[]>;
    createMany(input: {
      readonly data: readonly DdaNotificationPreferenceRowV1[];
    }): Promise<{ readonly count: number }>;
    deleteMany(input: {
      readonly where: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
  };
  readonly ddaNotificationPreferenceCommandReceipt: {
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationPreferenceCommandReceiptRowV1 | null>;
    create(input: {
      readonly data: DdaNotificationPreferenceCommandReceiptRowV1;
    }): Promise<DdaNotificationPreferenceCommandReceiptRowV1>;
  };
}

export interface DdaNotificationIntentRowV1 {
  readonly id: string;
  readonly eventId: string;
  readonly eventHash: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly subjectId: string;
  readonly kind: string;
  readonly action: string;
  readonly labelVi: string;
  readonly labelEn: string;
  readonly createdAt: Date;
  readonly correlationId: string;
  readonly occurrenceCount: number;
  readonly firstOccurredAt: Date;
  readonly lastOccurredAt: Date;
  readonly bundleKey: string;
  readonly bundleWindowStart: Date;
  readonly state: string;
  readonly revision: number;
  readonly dismissedAt: Date | null;
}

export interface DdaNotificationIntentDatabaseClientV1 {
  readonly ddaNotificationIntent: {
    create(input: {
      readonly data: Omit<DdaNotificationIntentRowV1, 'dismissedAt'> & {
        readonly dismissedAt?: Date | null;
      };
    }): Promise<DdaNotificationIntentRowV1>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationIntentRowV1 | null>;
    findMany(input: {
      readonly where: Record<string, unknown>;
      readonly orderBy: readonly Record<string, 'asc' | 'desc'>[];
      readonly take: number;
    }): Promise<readonly DdaNotificationIntentRowV1[]>;
    count(input: { readonly where: Record<string, unknown> }): Promise<number>;
    updateMany(input: {
      readonly where: Record<string, unknown>;
      readonly data: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
  };
  readonly ddaNotificationProjectionReceipt: {
    create(input: {
      readonly data: DdaNotificationProjectionReceiptRowV1;
    }): Promise<DdaNotificationProjectionReceiptRowV1>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationProjectionReceiptRowV1 | null>;
  };
  readonly ddaNotificationProjectionCheckpoint: {
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationProjectionCheckpointRowV1 | null>;
    upsert(input: {
      readonly where: Record<string, unknown>;
      readonly create: DdaNotificationProjectionCheckpointRowV1;
      readonly update: Record<string, unknown>;
    }): Promise<DdaNotificationProjectionCheckpointRowV1>;
    updateMany(input: {
      readonly where: Record<string, unknown>;
      readonly data: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
  };
  readonly ddaNotificationStateCommandReceipt: {
    create(input: {
      readonly data: DdaNotificationStateCommandReceiptRowV1;
    }): Promise<DdaNotificationStateCommandReceiptRowV1>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
    }): Promise<DdaNotificationStateCommandReceiptRowV1 | null>;
  };
}

export interface DdaNotificationProjectionReceiptRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly eventId: string;
  readonly eventHash: string;
  readonly notificationId: string;
  readonly bundleKey: string;
  readonly createdAt: Date;
}

export interface DdaNotificationProjectionCheckpointRowV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly consumerKey: string;
  readonly lastEventId: string;
  readonly lastEventHash: string;
  readonly lastOccurredAt: Date;
  readonly revision: number;
  readonly updatedAt: Date;
}

export interface DdaNotificationStateCommandReceiptRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly notificationId: string;
  readonly expectedRevision: number;
  readonly targetState: NotificationStateV1;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly resultDocument: unknown;
  readonly createdAt: Date;
}

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

/** Narrow durable refresh-event/outbox delegates. Values remain metadata-only. */
export interface DdaRefreshEventDatabaseClientV1 {
  readonly dashboardRefreshEventRecord: {
    create(input: {
      readonly data: {
        readonly eventId: string;
        readonly sequence: bigint | number;
        readonly scopeType: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
        readonly dashboardId: string;
        readonly snapshotId: string;
        readonly freshnessState: string;
        readonly eventKind: string;
        readonly metadata: unknown;
        readonly occurredAt: Date;
        readonly correlationId: string;
        readonly authorizationEpoch: number | null;
        readonly eventHash: string;
      };
    }): Promise<{
      readonly eventId: string;
      readonly sequence: bigint | number;
      readonly scopeType: string;
      readonly organizationId: string;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly dashboardId: string;
      readonly snapshotId: string;
      readonly freshnessState: string;
      readonly eventKind: string;
      readonly metadata: unknown;
      readonly occurredAt: Date;
      readonly correlationId: string;
      readonly authorizationEpoch: number | null;
      readonly eventHash: string;
      readonly createdAt: Date;
    }>;
    findFirst(input: {
      readonly where: Record<string, unknown>;
      readonly orderBy?: Record<string, unknown>;
    }): Promise<{
      readonly eventId: string;
      readonly sequence: bigint | number;
      readonly scopeType: string;
      readonly organizationId: string;
      readonly workspaceId: string;
      readonly projectId: string;
      readonly dashboardId: string;
      readonly snapshotId: string;
      readonly freshnessState: string;
      readonly eventKind: string;
      readonly metadata: unknown;
      readonly occurredAt: Date;
      readonly correlationId: string;
      readonly authorizationEpoch: number | null;
      readonly eventHash: string;
      readonly createdAt: Date;
    } | null>;
    findMany(input: {
      readonly where: Record<string, unknown>;
      readonly orderBy: Record<string, unknown>;
      readonly take: number;
    }): Promise<
      readonly {
        readonly eventId: string;
        readonly sequence: bigint | number;
        readonly scopeType: string;
        readonly organizationId: string;
        readonly workspaceId: string;
        readonly projectId: string;
        readonly dashboardId: string;
        readonly snapshotId: string;
        readonly freshnessState: string;
        readonly eventKind: string;
        readonly metadata: unknown;
        readonly occurredAt: Date;
        readonly correlationId: string;
        readonly authorizationEpoch: number | null;
        readonly eventHash: string;
        readonly createdAt: Date;
      }[]
    >;
  };
  readonly dashboardRefreshEventSequenceRecord: {
    upsert(input: {
      readonly where: Record<string, unknown>;
      readonly create: Record<string, unknown>;
      readonly update: Record<string, unknown>;
    }): Promise<{
      readonly nextSequence: bigint | number;
    }>;
  };
  readonly $transaction: <T>(
    callback: (transaction: DdaDatabaseClientV1) => Promise<T>,
  ) => Promise<T>;
}

/**
 * Narrow metadata-only DDA persistence surface (no ORM client import in the
 * feature).  Several feature-local contracts expose a `$transaction` method
 * whose callback is intentionally narrowed to that feature.  Intersecting
 * those contracts directly makes TypeScript select one of the narrower
 * callback types at call sites, which can hide delegates from other DDA
 * features.  Remove the feature-local transaction members and expose one
 * unified transaction boundary instead.
 */
export type DdaDatabaseClientV1 = Omit<DdaDashboardDatabaseClientV1, '$transaction'> &
  Omit<DdaAgentConsequentialCommandDatabaseClientV1, '$transaction'> &
  Omit<DdaAnalysisPlanDatabaseClientV1, '$transaction'> &
  Omit<DdaRefreshDatabaseClientV1, '$transaction'> &
  Omit<DdaEtlProposalDatabaseClientV1, '$transaction'> &
  Omit<DdaEtlAcceptanceCommandDatabaseClientV1, '$transaction'> &
  Omit<DdaReceiptExtractionCommandDatabaseClientV1, '$transaction'> &
  Omit<DdaDashboardDraftDatabaseClientV1, '$transaction'> &
  Omit<DdaDashboardWorkspaceHistoryDatabaseClientV1, '$transaction'> &
  Omit<DdaDashboardProposalDatabaseClientV1, '$transaction'> &
  Omit<DdaDependencyDatabaseClientV1, '$transaction'> &
  Omit<DdaRefreshEventDatabaseClientV1, '$transaction'> &
  Omit<DdaNotificationIntentDatabaseClientV1, '$transaction'> &
  Partial<DdaNotificationPreferenceDatabaseClientV1> &
  SourceCatalogDatabaseClientV1 &
  Partial<DdaUnifiedWorkspaceDatabaseClientV1> & {
    readonly $transaction: <T>(
      callback: (transaction: DdaDatabaseClientV1) => Promise<T>,
    ) => Promise<T>;
  };
