/** IAM-001: the only password representation that may cross the application boundary. */
export const PASSWORD_CREDENTIAL_SCHEMA_VERSION_V1 = 1 as const;
export const PASSWORD_HASH_ALGORITHM_V1 = 'argon2id' as const;
export const PASSWORD_MIN_LENGTH_V1 = 12;
export const PASSWORD_MAX_LENGTH_V1 = 128;

export interface PasswordCredentialV1 {
  readonly schemaVersion: typeof PASSWORD_CREDENTIAL_SCHEMA_VERSION_V1;
  readonly algorithm: typeof PASSWORD_HASH_ALGORITHM_V1;
  readonly encodedHash: string;
}

export type PasswordCredentialErrorCodeV1 = 'INVALID_PASSWORD' | 'INVALID_HASH' | 'HASH_FAILED';

export type PasswordCredentialResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: PasswordCredentialErrorCodeV1 };

function reject(code: PasswordCredentialErrorCodeV1): PasswordCredentialResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

export function validatePasswordInputV1(input: unknown): PasswordCredentialResultV1<string> {
  if (
    typeof input !== 'string' ||
    input.length < PASSWORD_MIN_LENGTH_V1 ||
    input.length > PASSWORD_MAX_LENGTH_V1 ||
    input.includes('\u0000') ||
    input.includes('\u000a') ||
    input.includes('\u000d')
  )
    return reject('INVALID_PASSWORD');
  return Object.freeze({ accepted: true, value: input });
}

export function createPasswordCredentialV1(
  encodedHash: unknown,
): PasswordCredentialResultV1<PasswordCredentialV1> {
  if (
    typeof encodedHash !== 'string' ||
    encodedHash.length > 512 ||
    !/^\$argon2id\$v=19\$m=\d+,p=\d+,t=\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/u.test(
      encodedHash,
    )
  )
    return reject('INVALID_HASH');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      schemaVersion: PASSWORD_CREDENTIAL_SCHEMA_VERSION_V1,
      algorithm: PASSWORD_HASH_ALGORITHM_V1,
      encodedHash,
    }),
  });
}
