export type FolderIntakeDisposition =
  | 'ADMITTED'
  | 'QUARANTINE'
  | 'DUPLICATE_EVENT'
  | 'PENDING';

export type FolderIntakeReason =
  | 'PATH_ESCAPE'
  | 'UNSUPPORTED_PROFILE'
  | 'SCHEMA_DRIFT'
  | 'PERIOD_OVERLAP'
  | 'DUPLICATE_KEY'
  | 'AMBIGUOUS_MAPPING'
  | 'MALFORMED_CONTENT'
  | 'PARTIAL_OR_LOCK_FILE';

export type FolderFileProfile = 'CSV' | 'XLSX';

export interface FolderIntakeDecisionV1 {
  readonly disposition: FolderIntakeDisposition;
  readonly reason?: FolderIntakeReason;
  readonly path?: string;
  readonly profile?: FolderFileProfile;
  readonly contentFingerprint?: string;
  readonly eventId?: string;
}

export interface FolderReviewQueueItemV1 {
  readonly eventId: string;
  readonly bindingId: string;
  readonly reason: FolderIntakeReason;
  readonly profileHint: string;
  readonly observedAtMs: number;
}
