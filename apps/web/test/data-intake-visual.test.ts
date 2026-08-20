import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const intakeCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/data-intake.css'),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return intakeCss.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'u'))?.[1] ?? '';
}

describe('Reviews visual language [DDA-006][DDA-009][WEB-020]', () => {
  it('uses the authenticated light canvas and existing product typography', () => {
    const page = cssBlock('.data-pipeline-page');

    expect(page).toContain('--intake-canvas: #f5f7fb;');
    expect(page).toContain('--intake-surface: #ffffff;');
    expect(page).toContain('--intake-ink: #102a63;');
    expect(page).toContain('--intake-body: #405776;');
    expect(page).toContain('font-family:');
    expect(page).toContain('Geist');
    expect(intakeCss).not.toContain('#0c1030');
    expect(intakeCss).not.toContain('#121844');
  });

  it('keeps loading, error, upload, and action states readable and keyboard-visible', () => {
    const reviewState = cssBlock('.data-pipeline-page__review-state');
    const alertState = cssBlock(".data-pipeline-page__review-state[role='alert']");

    expect(reviewState).toContain('background: var(--intake-surface);');
    expect(alertState).toContain('color: var(--intake-danger);');
    expect(alertState).toContain('background: var(--intake-danger-soft);');
    expect(intakeCss).toContain('.upload-panel__progress');
    expect(intakeCss).toContain('.upload-panel__success');
    expect(intakeCss).toContain('.upload-panel__failure');
    expect(intakeCss).toContain('.data-pipeline-page :is(a, button, input):focus-visible');
    expect(intakeCss).toContain('@media (max-width: 960px)');
    expect(intakeCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
