import {
  assertSupportedLocaleV1,
  DEFAULT_LOCALE_V1,
  type SupportedLocaleV1,
} from '@databreeze/i18n/v1';
import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';

const LocaleContext = createContext<SupportedLocaleV1>(DEFAULT_LOCALE_V1);

export function normalizeRouteLocale(locale: unknown): SupportedLocaleV1 {
  try {
    assertSupportedLocaleV1(locale);
    return locale;
  } catch {
    return DEFAULT_LOCALE_V1;
  }
}

export function LocaleProvider({
  children,
  locale,
}: PropsWithChildren<{ readonly locale: SupportedLocaleV1 }>) {
  useEffect(() => {
    globalThis.document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): SupportedLocaleV1 {
  return useContext(LocaleContext);
}
