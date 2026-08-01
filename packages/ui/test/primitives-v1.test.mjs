import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import React from 'react';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.databreeze.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.Node = dom.window.Node;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const { cleanup, render, screen } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { Button, Status } = await import('../dist/v1.js');

afterEach(cleanup);

test('[WEB-014, DSK-021 partial] Button retains native keyboard activation and focus', async () => {
  let activations = 0;
  const user = userEvent.setup({ document: dom.window.document });
  render(
    React.createElement(
      Button,
      { onClick: () => (activations += 1), type: 'button' },
      'Kiểm tra dữ liệu',
    ),
  );

  const button = screen.getByRole('button', { name: 'Kiểm tra dữ liệu' });
  await user.tab();
  assert.equal(dom.window.document.activeElement, button);
  await user.keyboard('{Enter}');
  await user.keyboard(' ');
  assert.equal(activations, 2);
});

test('[WEB-014, DSK-021 partial] Status exposes text and an icon without color-only meaning', () => {
  render(React.createElement(Status, { kind: 'warning' }, 'Cần kiểm tra'));

  const status = screen.getByRole('status');
  assert.equal(status.textContent.includes('Cần kiểm tra'), true);
  assert.equal(status.dataset.status, 'warning');
  assert.equal(status.querySelector('[aria-hidden="true"]')?.textContent.length > 0, true);
});

test('[WEB-014, DSK-021 partial] primitive CSS uses tokens for 44px controls and visible focus', () => {
  const css = readFileSync(resolve(packageRoot, 'src/styles-v1.css'), 'utf8');
  assert.match(css, /@import ['"]@databreeze\/design-tokens\/css\/v1['"];/u);
  assert.match(css, /min-block-size: var\(--db-sizing-control-minimum\);/u);
  assert.match(css, /\.db-button:focus-visible/u);
  assert.match(css, /outline: var\(--db-focus-ring-width\) solid var\(--db-color-focus\);/u);
  assert.match(css, /transition-duration: var\(--db-motion-duration-fast\);/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /transition-duration: 0ms;/u);
});
