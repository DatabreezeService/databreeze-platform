export type I18nErrorCodeV1 =
  | 'EXTRA_PARAMETER'
  | 'INVALID_ARGUMENT'
  | 'INVALID_CURRENCY'
  | 'INVALID_DATE'
  | 'INVALID_LOCALE'
  | 'INVALID_NUMBER'
  | 'INVALID_PARAMETER'
  | 'INVALID_TIME_ZONE'
  | 'MISSING_MESSAGE'
  | 'MISSING_PARAMETER';

const ERROR_MESSAGES_V1: Readonly<Record<I18nErrorCodeV1, string>> = Object.freeze({
  EXTRA_PARAMETER: 'The message received an undeclared parameter.',
  INVALID_ARGUMENT: 'The internationalization argument is invalid.',
  INVALID_CURRENCY: 'The currency code is not supported.',
  INVALID_DATE: 'The date value is invalid.',
  INVALID_LOCALE: 'The locale is not supported.',
  INVALID_NUMBER: 'The numeric value is invalid or outside the supported range.',
  INVALID_PARAMETER: 'The message parameter has an invalid value.',
  INVALID_TIME_ZONE: 'An explicit supported time zone is required.',
  MISSING_MESSAGE: 'The message key is not present in the catalog.',
  MISSING_PARAMETER: 'A required message parameter is missing.',
});

export class I18nErrorV1 extends Error {
  readonly code: I18nErrorCodeV1;

  constructor(code: I18nErrorCodeV1) {
    super(ERROR_MESSAGES_V1[code]);
    this.name = 'I18nErrorV1';
    this.code = code;
  }
}
