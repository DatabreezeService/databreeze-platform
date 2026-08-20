import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const billingPageCss = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/features/billing/billing-page.css',
  ),
  'utf8',
);
const billingPageSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/features/billing/billing-page.tsx',
  ),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = billingPageCss.match(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, 'u'));
  return match?.[1] ?? '';
}

describe('billing text contrast [WEB-014]', () => {
  it('keeps the landing-inspired billing cards readable on the canvas', () => {
    const readableMuted = 'color: #626987;';

    expect(cssBlock('.billing-page--plans .billing-plan-card__benefits')).toContain(readableMuted);
    expect(cssBlock('.billing-page--plans .billing-page__footnote')).toContain('color: #747b9c;');
    expect(cssBlock('.usage-page__credit-copy small')).toContain(
      'color: var(--workspace-muted, #a9aed2);',
    );
    expect(billingPageCss).not.toContain('var(--workspace-dim, #71779f)');
  });

  it('uses the authenticated dotted canvas without changing shared shell styles', () => {
    const pageSurface = cssBlock('.billing-page--plans');

    expect(billingPageSource).toContain('billing-page billing-page--plans');
    expect(pageSurface).toContain('--billing-canvas: #f5f7fb;');
    expect(pageSurface).toContain('radial-gradient(circle at 1px 1px');
    expect(pageSurface).toContain('margin: -80px -28px -28px;');
    expect(billingPageCss).not.toContain('background: var(--billing-page-bg);');
  });
});
