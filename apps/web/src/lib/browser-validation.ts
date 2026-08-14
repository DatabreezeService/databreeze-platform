/**
 * Browser-safe primitives for the v1 contract fields used by Web adapters.
 *
 * The canonical v1/v3 generated validators are intentionally Ajv-backed for
 * server/tooling use. Web runs under a strict CSP without `unsafe-eval`, so
 * these narrow primitives keep the same bounded UUID/UTC checks without
 * importing a validator that compiles code at runtime.
 */
export interface BrowserParseAccepted<TValue> {
  readonly accepted: true;
  readonly value: TValue;
}

export interface BrowserParseRejected {
  readonly accepted: false;
}

export type BrowserParseResult<TValue> = BrowserParseAccepted<TValue> | BrowserParseRejected;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

export function parseStableIdentifierBrowser(input: unknown): BrowserParseResult<string> {
  return typeof input === 'string' && UUID_PATTERN.test(input)
    ? { accepted: true, value: input }
    : { accepted: false };
}

export function parseStrictUtcTimestampBrowser(input: unknown): BrowserParseResult<string> {
  if (typeof input !== 'string' || !UTC_TIMESTAMP_PATTERN.test(input)) {
    return { accepted: false };
  }
  const milliseconds = Date.parse(input);
  return Number.isFinite(milliseconds)
    ? { accepted: true, value: input }
    : { accepted: false };
}

export function isRecordBrowser(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOnlyKeysBrowser(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
