import type { CompatibilityPort } from '../application/port.js';

export class Decision implements CompatibilityPort {
  check(): Promise<void> {
    return Promise.resolve();
  }
}
