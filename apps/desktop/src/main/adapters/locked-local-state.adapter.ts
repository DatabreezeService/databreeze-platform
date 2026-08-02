import type { LocalStatePort } from '../../application/local-state.port.ts';
import {
  parseDesktopSafeState,
  type DesktopLocale,
  type DesktopSafeState,
} from '../../shared/desktop-contract-v1.ts';

export interface LockedLocalStateAdapterInput {
  readonly applicationVersion: string;
  readonly locale: DesktopLocale;
}

export class LockedLocalStateAdapter implements LocalStatePort {
  readonly #state: DesktopSafeState;

  constructor({ applicationVersion, locale }: LockedLocalStateAdapterInput) {
    this.#state = parseDesktopSafeState({
      applicationVersion,
      dataMode: 'LOCAL',
      deviceState: 'locked',
      enrollmentState: 'not-enrolled',
      locale,
    });
  }

  getSafeState(): Promise<DesktopSafeState> {
    return Promise.resolve(this.#state);
  }
}
