import { DEFAULT_LOCALE_V1, SUPPORTED_LOCALES_V1, type SupportedLocaleV1 } from './catalogs-v1.ts';
import { I18nErrorV1 } from './errors-v1.ts';
import { readClosedDataObjectV1 } from './safe-input-v1.ts';

const NEGOTIATION_KEYS_V1 = new Set(['acceptLanguage', 'userLocale']);
const Q_VALUE_V1 = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u;
const LANGUAGE_TAG_V1 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

interface CandidateV1 {
  readonly locale: SupportedLocaleV1 | '*';
  readonly quality: number;
  readonly order: number;
}

function supportedLocaleForTag(tag: string): SupportedLocaleV1 | undefined {
  const trimmed = tag.trim();
  if (!LANGUAGE_TAG_V1.test(trimmed)) {
    return undefined;
  }
  const language = trimmed.split('-', 1)[0]?.toLowerCase();
  if (language === 'vi') {
    return 'vi-VN';
  }
  if (language === 'en') {
    return 'en';
  }
  return undefined;
}

function parseCandidate(part: string, order: number): CandidateV1 | undefined {
  const sections = part.split(';').map((section) => section.trim());
  if (sections.length > 2 || sections[0] === '') {
    return undefined;
  }
  const tag = sections[0];
  let quality = 1;
  if (sections.length === 2) {
    const match = /^q=(.+)$/iu.exec(sections[1] ?? '');
    if (match === null || !Q_VALUE_V1.test(match[1] ?? '')) {
      return undefined;
    }
    quality = Number(match[1]);
  }
  if (tag === '*') {
    return { locale: '*', quality, order };
  }
  const locale = supportedLocaleForTag(tag ?? '');
  return locale === undefined ? undefined : { locale, quality, order };
}

function negotiateHeader(header: unknown): SupportedLocaleV1 {
  if (typeof header !== 'string' || header.length === 0 || header.length > 8_192) {
    return DEFAULT_LOCALE_V1;
  }

  const candidates = header
    .split(',')
    .slice(0, 64)
    .map(parseCandidate)
    .filter((candidate): candidate is CandidateV1 => candidate !== undefined);
  const bestByLocale = new Map<SupportedLocaleV1 | '*', CandidateV1>();
  for (const candidate of candidates) {
    const current = bestByLocale.get(candidate.locale);
    if (
      current === undefined ||
      candidate.quality > current.quality ||
      (candidate.quality === current.quality && candidate.order < current.order)
    ) {
      bestByLocale.set(candidate.locale, candidate);
    }
  }

  const excluded = new Set<SupportedLocaleV1>(
    [...bestByLocale.values()]
      .filter(
        (candidate): candidate is CandidateV1 & { readonly locale: SupportedLocaleV1 } =>
          candidate.locale !== '*' && candidate.quality === 0,
      )
      .map((candidate) => candidate.locale),
  );
  const ranked = [...bestByLocale.values()]
    .filter((candidate) => candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.order - right.order);
  for (const candidate of ranked) {
    if (candidate.locale !== '*') {
      if (!excluded.has(candidate.locale)) {
        return candidate.locale;
      }
      continue;
    }
    const wildcardLocale = SUPPORTED_LOCALES_V1.find((locale) => !excluded.has(locale));
    if (wildcardLocale !== undefined) {
      return wildcardLocale;
    }
  }
  return DEFAULT_LOCALE_V1;
}

export interface LocaleNegotiationInputV1 {
  readonly userLocale?: unknown;
  readonly acceptLanguage?: unknown;
}

export function negotiateLocaleV1(input?: unknown): SupportedLocaleV1 {
  if (typeof input === 'string') {
    return negotiateHeader(input);
  }
  if (input === undefined || input === null) {
    return DEFAULT_LOCALE_V1;
  }

  let negotiation: Readonly<Record<string, unknown>>;
  try {
    negotiation = readClosedDataObjectV1(input, NEGOTIATION_KEYS_V1);
  } catch {
    return DEFAULT_LOCALE_V1;
  }
  const userLocale = negotiation['userLocale'];
  if (typeof userLocale === 'string') {
    const preferred = supportedLocaleForTag(userLocale);
    if (preferred !== undefined) {
      return preferred;
    }
  }
  return negotiateHeader(negotiation['acceptLanguage']);
}

export function assertSupportedLocaleV1(locale: unknown): asserts locale is SupportedLocaleV1 {
  if (locale !== 'vi-VN' && locale !== 'en') {
    throw new I18nErrorV1('INVALID_LOCALE');
  }
}
