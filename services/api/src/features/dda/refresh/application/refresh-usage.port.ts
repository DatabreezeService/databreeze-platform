/** DDA-036: BUA-composed usage admission for refresh/materialization paid resources. */

export type RefreshUsageClassV1 =
  | 'STORAGE'
  | 'PROFILE_ETL'
  | 'AI'
  | 'OCR'
  | 'MATERIALIZATION'
  | 'REFRESH_FREQUENCY'
  | 'CONCURRENCY'
  | 'CACHE_RETENTION'
  | 'PUBLICATION';

export type RefreshUsageScopeLevelV1 = 'organization' | 'workspace' | 'project';

export interface RefreshUsagePortV1 {
  evaluate(input: {
    readonly usageClass: RefreshUsageClassV1;
    readonly scopeLevel: RefreshUsageScopeLevelV1;
  }): Promise<{ readonly admitted: boolean; readonly reasonCode?: string }>;

  reserve(input: {
    readonly reservationKey: string;
    readonly usageClass: RefreshUsageClassV1;
  }): Promise<{ readonly reservationId: string }>;

  finalize(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;

  emitContentSafeOutcome(input: {
    readonly action: string;
    readonly outcome: string;
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<void>;
}
