import type { DashboardSnapshotV1 } from '@databreeze/domain/data-to-dashboard/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { RefreshEventAppendInputV1 } from './refresh-event-bus.js';

export const REFRESH_COMMIT_OUTBOX_PORT = Symbol('REFRESH_COMMIT_OUTBOX_PORT');

/**
 * Narrow transaction boundary for DDA-032/DDA-034. Implementations must commit the complete
 * snapshot pointer, dashboard refresh state, and content-safe event in one durable transaction.
 */
export interface RefreshCommitOutboxPortV1 {
  commitSnapshotAndEvent(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly refreshId: string;
    readonly expectedRevision: number;
    readonly expectedLeaseId: string;
    readonly expectedInputSelectorHash: string;
    readonly snapshot: DashboardSnapshotV1;
    readonly event: RefreshEventAppendInputV1;
  }): Promise<void>;
}
