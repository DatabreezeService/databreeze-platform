import { I18nErrorV1 } from './errors-v1.ts';

type IntrinsicFunctionV1 = (...arguments_: never[]) => unknown;

const reflectApplyV1 = Reflect.apply;
const DateConstructorV1 = Date;
const IntlObjectV1 = Intl;
const LocaleConstructorV1 = Intl.Locale;
const DateTimeFormatConstructorV1 = Intl.DateTimeFormat;
const NumberFormatConstructorV1 = Intl.NumberFormat;
const ListFormatConstructorV1 = Intl.ListFormat;
const RelativeTimeFormatConstructorV1 = Intl.RelativeTimeFormat;
const PluralRulesConstructorV1 = Intl.PluralRules;

function captureMethodV1(target: object, key: PropertyKey): IntrinsicFunctionV1 {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined || typeof descriptor.value !== 'function') {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  return descriptor.value as IntrinsicFunctionV1;
}

function captureGetterV1(target: object, key: PropertyKey): IntrinsicFunctionV1 {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined || typeof descriptor.get !== 'function') {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The getter is intentionally captured with its receiver supplied by Reflect.apply.
  return descriptor.get as IntrinsicFunctionV1;
}

function applyIntrinsicV1<TResult>(
  intrinsic: IntrinsicFunctionV1,
  thisArgument: unknown,
  argumentsList: readonly unknown[],
): TResult {
  return reflectApplyV1(intrinsic, thisArgument, argumentsList) as TResult;
}

const getCanonicalLocalesV1 = captureMethodV1(Intl, 'getCanonicalLocales');
const supportedValuesOfV1 = captureMethodV1(Intl, 'supportedValuesOf');
const localeLanguageGetterV1 = captureGetterV1(
  LocaleConstructorV1.prototype as unknown as object,
  'language',
);
const dateGetTimeV1 = captureMethodV1(DateConstructorV1.prototype, 'getTime');
const dateTimeFormatGetterV1 = captureGetterV1(DateTimeFormatConstructorV1.prototype, 'format');
const numberFormatGetterV1 = captureGetterV1(NumberFormatConstructorV1.prototype, 'format');
const listFormatMethodV1 = captureMethodV1(ListFormatConstructorV1.prototype, 'format');
const relativeTimeFormatMethodV1 = captureMethodV1(
  RelativeTimeFormatConstructorV1.prototype as unknown as object,
  'format',
);
const pluralSelectMethodV1 = captureMethodV1(
  PluralRulesConstructorV1.prototype as unknown as object,
  'select',
);
const stringConversionV1 = captureMethodV1(globalThis, 'String');
const stringCharCodeAtV1 = captureMethodV1(String.prototype, 'charCodeAt');
const stringNormalizeV1 = captureMethodV1(String.prototype, 'normalize');
const stringReplaceV1 = captureMethodV1(String.prototype, 'replace');
const stringTrimV1 = captureMethodV1(String.prototype, 'trim');
const stringSplitV1 = captureMethodV1(String.prototype, 'split');

export function canonicalizeLocalesIntrinsicV1(locales: readonly string[]): readonly string[] {
  return applyIntrinsicV1<string[]>(getCanonicalLocalesV1, IntlObjectV1, [locales]);
}

export function localeLanguageIntrinsicV1(tag: string): string {
  const locale = new LocaleConstructorV1(tag);
  return applyIntrinsicV1<string>(localeLanguageGetterV1, locale, []);
}

export function supportedValuesIntrinsicV1(key: 'currency'): readonly string[] {
  return applyIntrinsicV1<string[]>(supportedValuesOfV1, IntlObjectV1, [key]);
}

export function dateTimestampIntrinsicV1(value: unknown): number {
  return applyIntrinsicV1<number>(dateGetTimeV1, value, []);
}

export function createDateIntrinsicV1(timestamp: number): Date {
  return new DateConstructorV1(timestamp);
}

export function formatDateTimeIntrinsicV1(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  value: Date,
): string {
  const formatter = new DateTimeFormatConstructorV1(locale, options);
  const format = applyIntrinsicV1<(date?: Date | number) => string>(
    dateTimeFormatGetterV1,
    formatter,
    [],
  );
  return format(value);
}

export function formatNumberIntrinsicV1(
  locale: string,
  options: Intl.NumberFormatOptions,
  value: number,
): string {
  const formatter = new NumberFormatConstructorV1(locale, options);
  const format = applyIntrinsicV1<(number?: number | bigint) => string>(
    numberFormatGetterV1,
    formatter,
    [],
  );
  return format(value);
}

export function formatListIntrinsicV1(
  locale: string,
  options: Intl.ListFormatOptions,
  values: readonly string[],
): string {
  const formatter = new ListFormatConstructorV1(locale, options);
  return applyIntrinsicV1<string>(listFormatMethodV1, formatter, [values]);
}

export function formatRelativeTimeIntrinsicV1(
  locale: string,
  options: Intl.RelativeTimeFormatOptions,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  const formatter = new RelativeTimeFormatConstructorV1(locale, options);
  return applyIntrinsicV1<string>(relativeTimeFormatMethodV1, formatter, [value, unit]);
}

export function selectPluralIntrinsicV1(
  locale: string,
  options: Intl.PluralRulesOptions,
  value: number,
): Intl.LDMLPluralRule {
  const formatter = new PluralRulesConstructorV1(locale, options);
  return applyIntrinsicV1<Intl.LDMLPluralRule>(pluralSelectMethodV1, formatter, [value]);
}

export function stringCodeUnitAtIntrinsicV1(value: string, index: number): number {
  return applyIntrinsicV1<number>(stringCharCodeAtV1, value, [index]);
}

export function convertToStringIntrinsicV1(value: unknown): string {
  return applyIntrinsicV1<string>(stringConversionV1, undefined, [value]);
}

export function normalizeStringIntrinsicV1(value: string): string {
  return applyIntrinsicV1<string>(stringNormalizeV1, value, ['NFC']);
}

export function replaceStringIntrinsicV1(
  value: string,
  pattern: RegExp,
  replacement: (substring: string, capture: string) => string,
): string {
  return applyIntrinsicV1<string>(stringReplaceV1, value, [pattern, replacement]);
}

export function trimStringIntrinsicV1(value: string): string {
  return applyIntrinsicV1<string>(stringTrimV1, value, []);
}

export function splitStringIntrinsicV1(value: string, separator: string): readonly string[] {
  return applyIntrinsicV1<string[]>(stringSplitV1, value, [separator]);
}
