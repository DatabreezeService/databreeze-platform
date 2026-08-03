export type EntitlementProblemCodeV1 =
  | 'ENTITLEMENT_NOT_FOUND'
  | 'ENTITLEMENT_REQUEST_INVALID'
  | 'ENTITLEMENT_UNAVAILABLE';

export class EntitlementProblemError extends Error {
  public constructor(readonly code: EntitlementProblemCodeV1) {
    super(code);
  }
}
