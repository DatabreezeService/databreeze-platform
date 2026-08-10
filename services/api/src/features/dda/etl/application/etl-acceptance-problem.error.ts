import type { EtlAcceptanceProblemCodeV1 } from './etl-acceptance.service.js';

export class EtlAcceptanceProblemError extends Error {
  public constructor(readonly code: EtlAcceptanceProblemCodeV1) {
    super(code);
    this.name = 'EtlAcceptanceProblemError';
  }
}
