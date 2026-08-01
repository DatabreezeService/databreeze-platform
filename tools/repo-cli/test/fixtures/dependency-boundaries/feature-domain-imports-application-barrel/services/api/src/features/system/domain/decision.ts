import type { CompatibilityPort } from '../application';

export class Decision implements CompatibilityPort {
  check(): Promise<void> {
    return Promise.resolve();
  }
}
