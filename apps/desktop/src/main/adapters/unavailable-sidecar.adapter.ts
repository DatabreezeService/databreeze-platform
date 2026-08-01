import type { SidecarLifecyclePort } from '../../application/sidecar-lifecycle.port.ts';
import {
  parseSidecarSafeStatus,
  type SidecarSafeStatus,
} from '../../shared/desktop-contract-v1.ts';

export class UnavailableSidecarAdapter implements SidecarLifecyclePort {
  readonly #status = parseSidecarSafeStatus({
    engineVersion: null,
    lifecycle: 'not-installed',
    protocolVersion: null,
  });

  getStatus(): Promise<SidecarSafeStatus> {
    return Promise.resolve(this.#status);
  }
}
