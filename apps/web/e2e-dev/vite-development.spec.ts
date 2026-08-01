import { expect, test } from '@playwright/test';

test('Vite development renders the workspace without CSP or React Refresh failures', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  const response = await page.goto('/en/workspace');

  await expect(page.getByRole('heading', { name: 'Open governed work' })).toBeVisible();
  expect(response?.headers()['content-security-policy']).toBeUndefined();
  expect(
    runtimeErrors.filter((message) =>
      /content security policy|react refresh|preamble/iu.test(message),
    ),
  ).toEqual([]);
});
