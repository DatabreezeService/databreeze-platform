import {
  type ClientCompatibilityInput,
  type ClientCompatibilityResult,
  decideClientCompatibility,
} from '../domain/client-compatibility.js';
import type { ClientCompatibilityPort } from './client-compatibility.port.js';

export class SupportedClientCompatibilityService implements ClientCompatibilityPort {
  check(input: ClientCompatibilityInput): Promise<ClientCompatibilityResult> {
    return Promise.resolve(decideClientCompatibility(input));
  }
}
