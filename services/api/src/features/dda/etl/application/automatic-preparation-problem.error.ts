import type { AutomaticPreparationEnqueueProblemCodeV1 } from './automatic-preparation-enqueue.service.js';

export class AutomaticPreparationProblemError extends Error {
  public constructor(public readonly code: AutomaticPreparationEnqueueProblemCodeV1) {
    super(code);
    this.name = 'AutomaticPreparationProblemError';
  }
}
