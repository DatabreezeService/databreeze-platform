export type RecoveryProblemCodeV1 =
  | 'RECOVERY_REQUEST_REJECTED'
  | 'RECOVERY_TOKEN_INVALID'
  | 'RECOVERY_UNAVAILABLE';

export class RecoveryProblemError extends Error {
  public constructor(readonly code: RecoveryProblemCodeV1) {
    super(code);
    this.name = 'RecoveryProblemError';
  }
}
