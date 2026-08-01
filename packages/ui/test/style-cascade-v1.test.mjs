import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenCss = readFileSync(
  resolve(packageRoot, '../design-tokens/tokens/generated/css/v1.css'),
  'utf8',
);
const uiCss = readFileSync(resolve(packageRoot, 'src/styles-v1.css'), 'utf8').replace(
  /^@import [^;]+;\s*/u,
  '',
);

function resolveVariables(window, element, value) {
  let resolved = value;
  for (let depth = 0; depth < 20 && resolved.includes('var('); depth += 1) {
    resolved = resolved.replace(/var\((--[a-z0-9-]+)\)/giu, (_match, name) => {
      const tokenValue = window.getComputedStyle(element).getPropertyValue(name).trim();
      assert.notEqual(tokenValue, '', `unresolved custom property ${name}`);
      return tokenValue;
    });
  }
  assert.doesNotMatch(resolved, /var\(/u, `unresolved effective value: ${resolved}`);
  return resolved;
}

function effectiveStyle(window, element, property) {
  return resolveVariables(
    window,
    element,
    window.getComputedStyle(element).getPropertyValue(property),
  );
}

function activateMedia(document, condition) {
  const replacements = [];
  let matchCount = 0;
  for (const style of document.querySelectorAll('style')) {
    const styleSheet = style.sheet;
    assert.notEqual(styleSheet, null, 'style element has no stylesheet');
    const rulesInOriginalOrder = [];
    for (const rule of styleSheet.cssRules) {
      if (rule.type === 4 && rule.conditionText === condition) {
        matchCount += 1;
        rulesInOriginalOrder.push(...[...rule.cssRules].map((nestedRule) => nestedRule.cssText));
      } else {
        rulesInOriginalOrder.push(rule.cssText);
      }
    }
    replacements.push([style, rulesInOriginalOrder.join('\n')]);
  }
  assert.notEqual(matchCount, 0, `no rules matched ${condition}`);
  for (const [style, css] of replacements) style.textContent = css;
}

test('[WEB-014, DSK-021 partial] rendered Button has effective focus, size, and reduced motion', () => {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${tokenCss}\n${uiCss}</style></head><body><button class="db-button db-button--secondary">Kiá»ƒm tra</button></body></html>`,
    { pretendToBeVisual: true, url: 'https://app.databreeze.test/' },
  );
  const button = dom.window.document.querySelector('button');
  activateMedia(dom.window.document, '(prefers-reduced-motion: reduce)');
  button.focus();

  assert.equal(effectiveStyle(dom.window, button, 'min-block-size'), '44px');
  assert.equal(effectiveStyle(dom.window, button, 'min-inline-size'), '44px');
  assert.equal(effectiveStyle(dom.window, button, 'outline'), '3px solid #1d4ed8');
  const root = dom.window.document.documentElement;
  assert.equal(effectiveStyle(dom.window, root, '--db-motion-duration-fast'), '0ms');
  assert.equal(effectiveStyle(dom.window, root, '--db-motion-duration-normal'), '0ms');
  assert.equal(effectiveStyle(dom.window, root, '--db-motion-duration-slow'), '0ms');
  assert.equal(effectiveStyle(dom.window, button, 'transition-duration'), '0ms');
});

test('reduced-motion activation preserves a later applicable cascade override', () => {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${tokenCss}\n${uiCss}</style><style>.db-button { transition-duration: 999ms; }</style></head><body><button class="db-button">Kiá»ƒm tra</button></body></html>`,
    { pretendToBeVisual: true, url: 'https://app.databreeze.test/' },
  );
  const button = dom.window.document.querySelector('button');

  activateMedia(dom.window.document, '(prefers-reduced-motion: reduce)');

  assert.equal(effectiveStyle(dom.window, button, 'transition-duration'), '999ms');
});
