import type { EtlProposalProblemCodeV1 } from './etl-proposal.service.js';

export class EtlProposalProblemError extends Error {
  public constructor(readonly code: EtlProposalProblemCodeV1) {
    super(code);
    this.name = 'EtlProposalProblemError';
  }
}
