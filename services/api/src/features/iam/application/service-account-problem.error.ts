export type ServiceAccountProblemCodeV1 =
  | 'SERVICE_ACCOUNT_REQUEST_REJECTED'
  | 'SERVICE_ACCOUNT_SCOPE_DENIED'
  | 'SERVICE_ACCOUNT_NOT_FOUND'
  | 'SERVICE_ACCOUNT_CONFLICT'
  | 'SERVICE_ACCOUNT_REVOKED'
  | 'SERVICE_ACCOUNT_EXPIRED'
  | 'SERVICE_ACCOUNT_UNAVAILABLE';

export class ServiceAccountProblemError extends Error {
  public constructor(readonly code: ServiceAccountProblemCodeV1) {
    super(code);
    this.name = 'ServiceAccountProblemError';
  }
}
