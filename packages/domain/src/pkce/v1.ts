/** IAM-002: provider-independent RFC 7636 S256 validation for native sign-in. */
export const PKCE_SCHEMA_VERSION_V1 = 1 as const;
export const PKCE_VERIFIER_MIN_LENGTH_V1 = 43 as const;
export const PKCE_VERIFIER_MAX_LENGTH_V1 = 128 as const;

export interface PkceChallengeV1 {
  readonly schemaVersion: typeof PKCE_SCHEMA_VERSION_V1;
  readonly method: 'S256';
  readonly challenge: string;
}

export type PkceResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: 'INVALID_VERIFIER' | 'CRYPTO_UNAVAILABLE' };

export interface PkceHashPortV1 {
  sha256Base64Url(value: string): string;
}

function validVerifier(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    input.length >= PKCE_VERIFIER_MIN_LENGTH_V1 &&
    input.length <= PKCE_VERIFIER_MAX_LENGTH_V1 &&
    /^[A-Za-z0-9\-._~]+$/u.test(input)
  );
}

function equalStrings(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function createPkceChallengeV1(
  verifierInput: unknown,
  hashPort: PkceHashPortV1,
): PkceResultV1<PkceChallengeV1> {
  if (!validVerifier(verifierInput))
    return Object.freeze({ accepted: false, code: 'INVALID_VERIFIER' });
  try {
    const challenge = hashPort.sha256Base64Url(verifierInput);
    if (!/^[A-Za-z0-9_-]{43}$/u.test(challenge))
      return Object.freeze({ accepted: false, code: 'CRYPTO_UNAVAILABLE' });
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        schemaVersion: PKCE_SCHEMA_VERSION_V1,
        method: 'S256' as const,
        challenge,
      }),
    });
  } catch {
    return Object.freeze({ accepted: false, code: 'CRYPTO_UNAVAILABLE' });
  }
}

export function verifyPkceChallengeV1(
  verifierInput: unknown,
  challengeInput: unknown,
  hashPort: PkceHashPortV1,
): boolean {
  if (typeof challengeInput !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(challengeInput))
    return false;
  const created = createPkceChallengeV1(verifierInput, hashPort);
  return created.accepted && equalStrings(created.value.challenge, challengeInput);
}

export function isAllowedRedirectUriV1(input: unknown): boolean {
  if (typeof input !== 'string' || input.length > 200) return false;
  if (
    input === 'com.databreeze.desktop:/oauth2redirect' ||
    input === 'com.databreeze.android:/oauth2redirect'
  )
    return true;
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/callback$/u.exec(input);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= 1 && port <= 65_535;
}
