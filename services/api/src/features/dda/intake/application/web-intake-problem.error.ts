import type { DdaIntakeProblemCodeV1 } from './intake-profile.port.js';

export class WebIntakeProblemError extends Error {
  public constructor(readonly code: DdaIntakeProblemCodeV1) {
    super(code);
    this.name = 'WebIntakeProblemError';
  }
}
