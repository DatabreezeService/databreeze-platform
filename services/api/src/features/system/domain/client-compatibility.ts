export interface ClientCompatibilityInput {
  readonly clientPlatform: 'android' | 'desktop' | 'web';
  readonly clientVersion: string;
}

export interface ClientCompatibilityResult {
  readonly apiMajorVersion: 1;
  readonly status: 'supported';
}

export function decideClientCompatibility(
  input: ClientCompatibilityInput,
): ClientCompatibilityResult {
  void input;
  return { apiMajorVersion: 1, status: 'supported' };
}
