import { I18nErrorV1 } from './errors-v1.ts';

export function readClosedDataObjectV1(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new I18nErrorV1('INVALID_ARGUMENT');
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new I18nErrorV1('INVALID_ARGUMENT');
    }

    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowedKeys.has(key)) {
        throw new I18nErrorV1('INVALID_ARGUMENT');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        throw new I18nErrorV1('INVALID_ARGUMENT');
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof I18nErrorV1) {
      throw error;
    }
    throw new I18nErrorV1('INVALID_ARGUMENT');
  }
}
