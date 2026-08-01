import type {
  ClientCompatibilityInput,
  ClientCompatibilityResult,
} from '../domain/client-compatibility.js';

export const CLIENT_COMPATIBILITY_PORT = Symbol('CLIENT_COMPATIBILITY_PORT');

export type { ClientCompatibilityInput, ClientCompatibilityResult };

export interface ClientCompatibilityPort {
  check(input: ClientCompatibilityInput): Promise<ClientCompatibilityResult>;
}
