export type MfaProblemCodeV1 = 'MFA_REQUEST_REJECTED' | 'MFA_UNAVAILABLE';

export class MfaProblemError extends Error {
  constructor(readonly code: MfaProblemCodeV1) {
    super(code);
    this.name = 'MfaProblemError';
  }
}
