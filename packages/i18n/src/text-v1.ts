import { I18nErrorV1 } from './errors-v1.ts';

const MAX_IDENTIFIER_LENGTH_V1 = 128;
const MAX_TEXT_LENGTH_V1 = 512;
const UNSAFE_TEXT_V1 = /(?:\p{Cc}|[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069])/u;
const IDENTIFIER_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function sanitizeTextParameterV1(value: unknown, kind: 'identifier' | 'text'): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw new I18nErrorV1('INVALID_PARAMETER');
  }

  let normalized: string;
  try {
    normalized = value.normalize('NFC');
  } catch {
    throw new I18nErrorV1('INVALID_PARAMETER');
  }
  const maximumLength = kind === 'identifier' ? MAX_IDENTIFIER_LENGTH_V1 : MAX_TEXT_LENGTH_V1;
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    UNSAFE_TEXT_V1.test(normalized) ||
    (kind === 'identifier' && !IDENTIFIER_V1.test(normalized))
  ) {
    throw new I18nErrorV1('INVALID_PARAMETER');
  }
  return normalized;
}
