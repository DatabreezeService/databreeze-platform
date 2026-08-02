export type SessionProblemCodeV1 = 'SESSION_INVALID' | 'SESSION_UNAVAILABLE';

export class SessionProblemError extends Error {
  constructor(readonly code: SessionProblemCodeV1) {
    super(code);
    this.name = 'SessionProblemError';
  }
}
