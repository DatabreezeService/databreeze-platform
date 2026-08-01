import { DEFAULT_LOCALE_V1, SUPPORTED_LOCALES_V1, type SupportedLocaleV1 } from './catalogs-v1.ts';
import { I18nErrorV1 } from './errors-v1.ts';
import { readClosedDataObjectV1 } from './safe-input-v1.ts';

const NEGOTIATION_KEYS_V1 = new Set(['acceptLanguage', 'userLocale']);
const Q_VALUE_V1 = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u;
const canonicalizeLocalesV1 = Intl.getCanonicalLocales.bind(Intl);
const LocaleV1 = Intl.Locale;

interface CanonicalRangeV1 {
  readonly canonical: string;
  readonly locale: SupportedLocaleV1;
  readonly specificity: number;
}

interface CandidateV1 {
  readonly canonical: string;
  readonly locale: SupportedLocaleV1 | '*';
  readonly quality: number;
  readonly order: number;
  readonly specificity: number;
}

function canonicalSupportedRange(tag: string): CanonicalRangeV1 | undefined {
  const trimmed = tag.trim();
  if (trimmed === '' || trimmed.length > 255) {
    return undefined;
  }

  try {
    const canonicalLocales = canonicalizeLocalesV1([trimmed]);
    if (canonicalLocales.length !== 1 || canonicalLocales[0] === undefined) {
      return undefined;
    }
    const canonical = canonicalLocales[0];
    const language = new LocaleV1(canonical).language.toLowerCase();
    const locale = language === 'vi' ? 'vi-VN' : language === 'en' ? 'en' : undefined;
    if (locale === undefined) {
      return undefined;
    }
    return { canonical, locale, specificity: canonical.split('-').length };
  } catch {
    return undefined;
  }
}

function parseCandidate(part: string, order: number): CandidateV1 | undefined {
  const sections = part.split(';').map((section) => section.trim());
  if (sections.length > 2 || sections[0] === '') {
    return undefined;
  }
  let quality = 1;
  if (sections.length === 2) {
    const match = /^q=(.+)$/iu.exec(sections[1] ?? '');
    if (match === null || !Q_VALUE_V1.test(match[1] ?? '')) {
      return undefined;
    }
    quality = Number(match[1]);
  }

  if (sections[0] === '*') {
    return { canonical: '*', locale: '*', quality, order, specificity: 0 };
  }
  const range = canonicalSupportedRange(sections[0] ?? '');
  return range === undefined ? undefined : { ...range, quality, order };
}

function consolidateDuplicateRanges(candidates: readonly CandidateV1[]): readonly CandidateV1[] {
  const bestByRange = new Map<string, CandidateV1>();
  for (const candidate of candidates) {
    const key = candidate.locale === '*' ? '*' : candidate.canonical;
    const current = bestByRange.get(key);
    if (
      current === undefined ||
      candidate.quality > current.quality ||
      (candidate.quality === current.quality && candidate.order < current.order)
    ) {
      bestByRange.set(key, candidate);
    }
  }
  return [...bestByRange.values()];
}

function mostSpecificExplicit(
  candidates: readonly CandidateV1[],
  locale: SupportedLocaleV1,
): CandidateV1 | undefined {
  return candidates
    .filter((candidate) => candidate.locale === locale)
    .sort(
      (left, right) =>
        right.specificity - left.specificity ||
        right.quality - left.quality ||
        left.order - right.order,
    )[0];
}

function bestWildcard(candidates: readonly CandidateV1[]): CandidateV1 | undefined {
  return candidates
    .filter((candidate) => candidate.locale === '*')
    .sort((left, right) => right.quality - left.quality || left.order - right.order)[0];
}

function negotiateHeader(header: unknown): SupportedLocaleV1 {
  if (typeof header !== 'string' || header.length === 0 || header.length > 8_192) {
    return DEFAULT_LOCALE_V1;
  }

  const candidates = consolidateDuplicateRanges(
    header
      .split(',')
      .slice(0, 64)
      .map(parseCandidate)
      .filter((candidate): candidate is CandidateV1 => candidate !== undefined),
  );
  const wildcard = bestWildcard(candidates);
  const scores = SUPPORTED_LOCALES_V1.map((locale, localeOrder) => {
    const explicit = mostSpecificExplicit(candidates, locale);
    const candidate = explicit ?? wildcard;
    return {
      locale,
      localeOrder,
      quality: candidate?.quality ?? 0,
      order: candidate?.order ?? Number.MAX_SAFE_INTEGER,
    };
  }).filter((score) => score.quality > 0);

  scores.sort(
    (left, right) =>
      right.quality - left.quality ||
      left.order - right.order ||
      left.localeOrder - right.localeOrder,
  );
  return scores[0]?.locale ?? DEFAULT_LOCALE_V1;
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
    const preferred = canonicalSupportedRange(userLocale);
    if (preferred !== undefined) {
      return preferred.locale;
    }
  }
  return negotiateHeader(negotiation['acceptLanguage']);
}

export function assertSupportedLocaleV1(locale: unknown): asserts locale is SupportedLocaleV1 {
  if (locale !== 'vi-VN' && locale !== 'en') {
    throw new I18nErrorV1('INVALID_LOCALE');
  }
}
