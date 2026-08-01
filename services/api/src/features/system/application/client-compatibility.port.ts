export const CLIENT_COMPATIBILITY_PORT = Symbol('CLIENT_COMPATIBILITY_PORT');

export interface ClientCompatibilityInput {
  readonly clientPlatform: 'android' | 'desktop' | 'web';
  readonly clientVersion: string;
}

export interface ClientCompatibilityResult {
  readonly apiMajorVersion: 1;
  readonly status: 'supported';
}

export interface ClientCompatibilityPort {
  check(input: ClientCompatibilityInput): Promise<ClientCompatibilityResult>;
}
