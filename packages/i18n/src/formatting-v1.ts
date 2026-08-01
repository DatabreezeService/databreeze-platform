import type { SupportedLocaleV1 } from './catalogs-v1.ts';
import { I18nErrorV1 } from './errors-v1.ts';
import {
  convertToStringIntrinsicV1,
  createDateIntrinsicV1,
  dateTimestampIntrinsicV1,
  formatDateTimeIntrinsicV1,
  formatListIntrinsicV1,
  formatNumberIntrinsicV1,
  formatRelativeTimeIntrinsicV1,
  selectPluralIntrinsicV1,
  supportedValuesIntrinsicV1,
  trimStringIntrinsicV1,
} from './intrinsics-v1.ts';
import { assertSupportedLocaleV1 } from './locale-v1.ts';
import { readClosedDataObjectV1 } from './safe-input-v1.ts';

const FRACTION_KEYS_V1 = new Set([
  'locale',
  'maximumFractionDigits',
  'minimumFractionDigits',
  'useGrouping',
]);
const CURRENCY_KEYS_V1 = new Set([...FRACTION_KEYS_V1, 'currency', 'currencyDisplay']);
const DATE_TIME_KEYS_V1 = new Set(['dateStyle', 'hour12', 'locale', 'timeStyle', 'timeZone']);
const LIST_KEYS_V1 = new Set(['locale', 'style', 'type']);
const RELATIVE_TIME_KEYS_V1 = new Set(['locale', 'numeric', 'style']);
const PLURAL_KEYS_V1 = new Set(['locale', 'type']);
const CURRENCY_CODES_V1 = new Set(supportedValuesIntrinsicV1('currency'));
const MAX_LIST_ITEMS_V1 = 1_000;
const RELATIVE_TIME_UNITS_V1 = new Set<Intl.RelativeTimeFormatUnit>([
  'day',
  'hour',
  'minute',
  'month',
  'quarter',
  'second',
  'week',
  'year',
]);

interface FractionOptionsV1 {
  readonly locale: SupportedLocaleV1;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
}

export type DecimalFormatOptionsV1 = FractionOptionsV1;

export interface CurrencyFormatOptionsV1 extends FractionOptionsV1 {
  readonly currency: string;
  readonly currencyDisplay?: 'code' | 'name' | 'narrowSymbol' | 'symbol';
}

export type PercentFormatOptionsV1 = FractionOptionsV1;

export interface DateTimeFormatOptionsV1 {
  readonly locale: SupportedLocaleV1;
  readonly timeZone: string;
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short';
  readonly timeStyle?: 'full' | 'long' | 'medium' | 'short';
  readonly hour12?: boolean;
}

export interface ListFormatOptionsV1 {
  readonly locale: SupportedLocaleV1;
  readonly type?: 'conjunction' | 'disjunction' | 'unit';
  readonly style?: 'long' | 'narrow' | 'short';
}

export interface RelativeTimeFormatOptionsV1 {
  readonly locale: SupportedLocaleV1;
  readonly numeric?: 'always' | 'auto';
  readonly style?: 'long' | 'narrow' | 'short';
}

export interface PluralFormatOptionsV1 {
  readonly locale: SupportedLocaleV1;
  readonly type?: 'cardinal' | 'ordinal';
}

function requiredLocale(options: Readonly<Record<string, unknown>>): SupportedLocaleV1 {
  const locale = options['locale'];
  assertSupportedLocaleV1(locale);
  return locale;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new I18nErrorV1('INVALID_NUMBER');
  }
  return value;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) {
      return value as T;
    }
  }
  throw new I18nErrorV1('INVALID_ARGUMENT');
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  return value;
}

function optionalFractionDigit(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 20) {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  return value;
}

function snapshotDateV1(value: unknown): Date {
  try {
    const timestamp = typeof value === 'number' ? value : dateTimestampIntrinsicV1(value);
    if (!Number.isFinite(timestamp)) {
      throw new I18nErrorV1('INVALID_DATE');
    }
    const date = createDateIntrinsicV1(timestamp);
    if (!Number.isFinite(dateTimestampIntrinsicV1(date))) {
      throw new I18nErrorV1('INVALID_DATE');
    }
    return date;
  } catch {
    throw new I18nErrorV1('INVALID_DATE');
  }
}

function snapshotStringListV1(value: unknown): readonly string[] {
  try {
    if (!Array.isArray(value)) {
      throw new I18nErrorV1('INVALID_ARGUMENT');
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > MAX_LIST_ITEMS_V1
    ) {
      throw new I18nErrorV1('INVALID_ARGUMENT');
    }
    const length = lengthDescriptor.value;
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') {
        continue;
      }
      if (typeof key !== 'string') {
        throw new I18nErrorV1('INVALID_ARGUMENT');
      }
      const index = Number(key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= length ||
        convertToStringIntrinsicV1(index) !== key
      ) {
        throw new I18nErrorV1('INVALID_ARGUMENT');
      }
    }

    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, convertToStringIntrinsicV1(index));
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'string'
      ) {
        throw new I18nErrorV1('INVALID_ARGUMENT');
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}

function numberFormatOptions(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
): { readonly locale: SupportedLocaleV1; readonly options: Intl.NumberFormatOptions } {
  const source = readClosedDataObjectV1(input, allowedKeys);
  const locale = requiredLocale(source);
  const minimumFractionDigits = optionalFractionDigit(source['minimumFractionDigits']);
  const maximumFractionDigits = optionalFractionDigit(source['maximumFractionDigits']);
  if (
    minimumFractionDigits !== undefined &&
    maximumFractionDigits !== undefined &&
    minimumFractionDigits > maximumFractionDigits
  ) {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  const useGrouping = optionalBoolean(source['useGrouping']);
  return {
    locale,
    options: {
      ...(minimumFractionDigits === undefined ? {} : { minimumFractionDigits }),
      ...(maximumFractionDigits === undefined ? {} : { maximumFractionDigits }),
      ...(useGrouping === undefined ? {} : { useGrouping }),
    },
  };
}

export function formatDateTimeV1(value: number | Date, input: DateTimeFormatOptionsV1): string {
  const source = readClosedDataObjectV1(input, DATE_TIME_KEYS_V1);
  const locale = requiredLocale(source);
  const rawTimeZone = source['timeZone'];
  if (typeof rawTimeZone !== 'string' || trimStringIntrinsicV1(rawTimeZone) === '') {
    throw new I18nErrorV1('INVALID_TIME_ZONE');
  }
  const date = snapshotDateV1(value);
  const dateStyle = optionalEnum(source['dateStyle'], ['full', 'long', 'medium', 'short']);
  const timeStyle = optionalEnum(source['timeStyle'], ['full', 'long', 'medium', 'short']);
  const hour12 = optionalBoolean(source['hour12']);
  try {
    return formatDateTimeIntrinsicV1(
      locale,
      {
        timeZone: rawTimeZone,
        dateStyle: dateStyle ?? 'medium',
        timeStyle: timeStyle ?? 'short',
        ...(hour12 === undefined ? {} : { hour12 }),
      },
      date,
    );
  } catch {
    throw new I18nErrorV1('INVALID_TIME_ZONE');
  }
}

export function formatDecimalV1(value: number, input: DecimalFormatOptionsV1): string {
  const { locale, options } = numberFormatOptions(input, FRACTION_KEYS_V1);
  const number = finiteNumber(value);
  try {
    return formatNumberIntrinsicV1(locale, { ...options, style: 'decimal' }, number);
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}

export function formatCurrencyV1(value: number, input: CurrencyFormatOptionsV1): string {
  const source = readClosedDataObjectV1(input, CURRENCY_KEYS_V1);
  const { locale, options } = numberFormatOptions(source, CURRENCY_KEYS_V1);
  const currency = source['currency'];
  if (
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(currency) ||
    !CURRENCY_CODES_V1.has(currency)
  ) {
    throw new I18nErrorV1('INVALID_CURRENCY');
  }
  const currencyDisplay = optionalEnum(source['currencyDisplay'], [
    'code',
    'name',
    'narrowSymbol',
    'symbol',
  ]);
  const number = finiteNumber(value);
  try {
    return formatNumberIntrinsicV1(
      locale,
      {
        ...options,
        style: 'currency',
        currency,
        ...(currencyDisplay === undefined ? {} : { currencyDisplay }),
      },
      number,
    );
  } catch {
    throw new I18nErrorV1('INVALID_CURRENCY');
  }
}

export function formatPercentV1(value: number, input: PercentFormatOptionsV1): string {
  const { locale, options } = numberFormatOptions(input, FRACTION_KEYS_V1);
  const maximumFractionDigits =
    options.maximumFractionDigits ?? Math.max(options.minimumFractionDigits ?? 0, 3);
  const number = finiteNumber(value);
  try {
    return formatNumberIntrinsicV1(
      locale,
      {
        ...options,
        maximumFractionDigits,
        style: 'percent',
      },
      number,
    );
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}

export function formatListV1(values: readonly string[], input: ListFormatOptionsV1): string {
  const source = readClosedDataObjectV1(input, LIST_KEYS_V1);
  const locale = requiredLocale(source);
  const snapshot = snapshotStringListV1(values);
  const type = optionalEnum(source['type'], ['conjunction', 'disjunction', 'unit']);
  const style = optionalEnum(source['style'], ['long', 'narrow', 'short']);
  try {
    return formatListIntrinsicV1(
      locale,
      {
        ...(type === undefined ? {} : { type }),
        ...(style === undefined ? {} : { style }),
      },
      snapshot,
    );
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}

export function formatRelativeTimeV1(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  input: RelativeTimeFormatOptionsV1,
): string {
  const source = readClosedDataObjectV1(input, RELATIVE_TIME_KEYS_V1);
  const locale = requiredLocale(source);
  if (typeof unit !== 'string' || !RELATIVE_TIME_UNITS_V1.has(unit)) {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
  const numeric = optionalEnum(source['numeric'], ['always', 'auto']);
  const style = optionalEnum(source['style'], ['long', 'narrow', 'short']);
  const number = finiteNumber(value);
  try {
    return formatRelativeTimeIntrinsicV1(
      locale,
      {
        ...(numeric === undefined ? {} : { numeric }),
        ...(style === undefined ? {} : { style }),
      },
      number,
      unit,
    );
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}

export function selectPluralCategoryV1(
  value: number,
  input: PluralFormatOptionsV1,
): Intl.LDMLPluralRule {
  const source = readClosedDataObjectV1(input, PLURAL_KEYS_V1);
  const locale = requiredLocale(source);
  const type = optionalEnum(source['type'], ['cardinal', 'ordinal']);
  const number = finiteNumber(value);
  try {
    return selectPluralIntrinsicV1(locale, type === undefined ? {} : { type }, number);
  } catch {
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}
