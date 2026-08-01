import { expect, test } from '@playwright/test';

for (const [route, locale] of [
  ['/en/workspace', 'en'],
  ['/vi-VN/workspace', 'vi-VN'],
] as const) {
  test(`${route} exposes locale-correct document metadata`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'DataBreeze');
  });
}

test('representative shell interactions do not write browser persistence', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(globalThis, '__databreezePersistenceCalls', {
      configurable: true,
      value: calls,
    });

    const originalLocalSetItem = localStorage.setItem.bind(localStorage);
    const originalSessionSetItem = sessionStorage.setItem.bind(sessionStorage);
    Storage.prototype.setItem = function setItem(key, value) {
      calls.push(`${this === localStorage ? 'localStorage' : 'sessionStorage'}.setItem:${key}`);
      return this === localStorage
        ? originalLocalSetItem(key, value)
        : originalSessionSetItem(key, value);
    };

    const browserGlobal = globalThis as unknown as {
      caches?: { open(name: string): Promise<unknown> };
      indexedDB: { open(name: string, version?: number): unknown };
      navigator: { serviceWorker?: { register(url: string): Promise<unknown> } };
    };
    const originalOpen = browserGlobal.indexedDB.open.bind(browserGlobal.indexedDB);
    browserGlobal.indexedDB.open = (name, version) => {
      calls.push(`indexedDB.open:${name}`);
      return version === undefined ? originalOpen(name) : originalOpen(name, version);
    };

    if (browserGlobal.caches !== undefined) {
      const originalCacheOpen = browserGlobal.caches.open.bind(browserGlobal.caches);
      browserGlobal.caches.open = (name) => {
        calls.push(`caches.open:${name}`);
        return originalCacheOpen(name);
      };
    }
    if (browserGlobal.navigator.serviceWorker !== undefined) {
      const originalRegister = browserGlobal.navigator.serviceWorker.register.bind(
        browserGlobal.navigator.serviceWorker,
      );
      browserGlobal.navigator.serviceWorker.register = (url) => {
        calls.push(`serviceWorker.register:${url}`);
        return originalRegister(url);
      };
    }
  });
  await page.goto('/en/workspace');

  await page.getByRole('searchbox', { name: 'Search' }).fill('invoice review');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'Notifications' }).click();
  await page.getByRole('button', { name: 'Create job' }).click();
  await page.getByRole('link', { name: 'Tiếng Việt' }).click();

  const calls = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __databreezePersistenceCalls: string[] })
        .__databreezePersistenceCalls,
  );
  expect(calls).toEqual([]);
});
