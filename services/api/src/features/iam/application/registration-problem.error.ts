export type RegistrationProblemCodeV1 =
  | 'REGISTRATION_REQUEST_REJECTED'
  | 'REGISTRATION_UNAVAILABLE';

export class RegistrationProblemError extends Error {
  public constructor(readonly code: RegistrationProblemCodeV1) {
    super(code);
    this.name = 'RegistrationProblemError';
  }
}
