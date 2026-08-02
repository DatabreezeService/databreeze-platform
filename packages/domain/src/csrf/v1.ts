/** IAM-002: browser mutation requests use a validated, session-bound CSRF token. */
export const CSRF_SCHEMA_VERSION_V1 = 1 as const;

const MIN_TOKEN_LENGTH_V1 = 32;
const MAX_TOKEN_LENGTH_V1 = 256;
const TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]+$/u;

export type CsrfTokenResultV1 =
  | { readonly accepted: true; readonly value: string }
  | { readonly accepted: false; readonly code: 'INVALID_TOKEN' };

function rejected(): CsrfTokenResultV1 {
  return Object.freeze({ accepted: false as const, code: 'INVALID_TOKEN' as const });
}

/** Validate the encoded token before it is bound to a browser session. */
export function validateCsrfTokenV1(input: unknown): CsrfTokenResultV1 {
  if (typeof input !== 'string') return rejected();
  if (input.length < MIN_TOKEN_LENGTH_V1 || input.length > MAX_TOKEN_LENGTH_V1) return rejected();
  if (!TOKEN_PATTERN_V1.test(input)) return rejected();
  return Object.freeze({ accepted: true as const, value: input });
}

/**
 * Compare cookie and header values without an early return on the first mismatch.
 * Invalid values are deliberately treated as a mismatch so callers fail closed.
 */
export function compareCsrfTokensV1(cookieToken: unknown, headerToken: unknown): boolean {
  const cookie = validateCsrfTokenV1(cookieToken);
  const header = validateCsrfTokenV1(headerToken);
  if (!cookie.accepted || !header.accepted) return false;

  const left = cookie.value;
  const right = header.value;
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    const leftCode = index < left.length ? left.charCodeAt(index) : 0;
    const rightCode = index < right.length ? right.charCodeAt(index) : 0;
    difference |= leftCode ^ rightCode;
  }
  return difference === 0;
}
