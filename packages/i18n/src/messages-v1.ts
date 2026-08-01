import {
  MESSAGE_CATALOGS_V1,
  MESSAGE_KEYS_V1,
  type MessageKeyV1,
  type MessageParameterTypeV1,
  type SupportedLocaleV1,
} from './catalogs-v1.ts';
import { I18nErrorV1 } from './errors-v1.ts';
import { assertSupportedLocaleV1 } from './locale-v1.ts';
import { readClosedDataObjectV1 } from './safe-input-v1.ts';

const MESSAGE_KEY_SET_V1 = new Set<string>(MESSAGE_KEYS_V1);
const PLACEHOLDER_V1 = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;

function assertParameterValue(type: MessageParameterTypeV1, value: unknown): void {
  if (type === 'string' && typeof value === 'string') {
    return;
  }
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  throw new I18nErrorV1('INVALID_PARAMETER');
}

export function formatMessageV1(
  locale: SupportedLocaleV1,
  key: MessageKeyV1,
  parameters: unknown = {},
): string {
  assertSupportedLocaleV1(locale);
  if (typeof key !== 'string' || !MESSAGE_KEY_SET_V1.has(key)) {
    throw new I18nErrorV1('MISSING_MESSAGE');
  }
  const catalogMessage = MESSAGE_CATALOGS_V1[locale][key];
  const parameterNames = Object.keys(catalogMessage.parameters);
  let safeParameters: Readonly<Record<string, unknown>>;
  try {
    safeParameters = readClosedDataObjectV1(parameters, new Set(parameterNames));
  } catch (error) {
    if (
      error instanceof I18nErrorV1 &&
      error.code === 'INVALID_ARGUMENT' &&
      parameters !== null &&
      typeof parameters === 'object'
    ) {
      let keys: PropertyKey[] = [];
      try {
        keys = Reflect.ownKeys(parameters);
      } catch {
        throw error;
      }
      if (keys.some((parameterName) => !parameterNames.includes(String(parameterName)))) {
        throw new I18nErrorV1('EXTRA_PARAMETER');
      }
    }
    throw error;
  }

  for (const parameterName of parameterNames) {
    if (!Object.hasOwn(safeParameters, parameterName)) {
      throw new I18nErrorV1('MISSING_PARAMETER');
    }
    assertParameterValue(catalogMessage.parameters[parameterName]!, safeParameters[parameterName]);
  }

  return catalogMessage.message.replace(PLACEHOLDER_V1, (_placeholder, parameterName: string) =>
    String(safeParameters[parameterName]),
  );
}
