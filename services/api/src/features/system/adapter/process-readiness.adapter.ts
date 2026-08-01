import type { ReadinessPort } from '../application/readiness.port.js';

export class ProcessReadinessAdapter implements ReadinessPort {
  check(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
