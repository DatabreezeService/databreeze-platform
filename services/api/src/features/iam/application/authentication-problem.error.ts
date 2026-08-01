import type { AuthenticationFailureCodeV1 } from './authentication.port.js';

export class AuthenticationProblemError extends Error {
  constructor(readonly code: AuthenticationFailureCodeV1) {
    super(code);
    this.name = 'AuthenticationProblemError';
  }
}
