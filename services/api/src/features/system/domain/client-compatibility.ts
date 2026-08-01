import type {
  ClientCompatibilityInput,
  ClientCompatibilityPort,
  ClientCompatibilityResult,
} from '../application/client-compatibility.port.js';

export class SupportedClientCompatibilityService implements ClientCompatibilityPort {
  check(input: ClientCompatibilityInput): Promise<ClientCompatibilityResult> {
    void input;
    return Promise.resolve({ apiMajorVersion: 1, status: 'supported' });
  }
}
