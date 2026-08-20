import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const analysisPageCss = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/features/analysis/analysis-page.css',
  ),
  'utf8',
);

function cssBlock(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = analysisPageCss.match(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, 'u'));
  return match?.[1] ?? '';
}

describe('analysis layout', () => {
  it('removes the header separator beneath the pill while preserving the history panel boundary', () => {
    expect(cssBlock('.analysis-page__heading')).not.toMatch(/border-bottom\s*:/u);
    expect(cssBlock('.analysis-conversation-history')).toMatch(/border-inline-end\s*:/u);
  });

  it('uses readable light-surface colors for analysis copy and state text', () => {
    expect(analysisPageCss).not.toMatch(/var\(--workspace-(?:ink|muted)\b/u);
    expect(analysisPageCss).toContain('var(--workspace-light-ink, #102a63)');
    expect(analysisPageCss).toContain('var(--workspace-light-muted, #53698f)');
    expect(analysisPageCss).toContain('color: #b42318;');
    expect(analysisPageCss).not.toMatch(/#(?:a9aed2|f7f7ff|8d9bff|55d6ff|ff9aa9)\b/iu);
    expect(cssBlock('.analysis-conversation-thread__prompts button:hover')).toMatch(
      /background:\s*var\(--workspace-cobalt-deep, #2f42e8\)/u,
    );
  });

  it('places the analysis workspace on the canvas with a raised readable surface', () => {
    expect(cssBlock('.analysis-page')).toMatch(/radial-gradient\(circle at 1px 1px/u);
    expect(cssBlock('.analysis-page')).toMatch(/height:\s*100%/u);
    expect(cssBlock('.analysis-page')).toMatch(/min-height:\s*0/u);
    expect(cssBlock('.analysis-page')).toContain('#f5f7fb');
    expect(cssBlock('.analysis-page__layout')).toContain('background: #ffffff');
    expect(cssBlock('.analysis-page__layout')).toMatch(/max-height:\s*100%/u);
    expect(cssBlock('.analysis-page__layout')).toMatch(/border:\s*1px solid/u);
    expect(cssBlock('.analysis-page__layout')).toMatch(/box-shadow:/u);
  });

  it('uses a translucent history pane with an opaque fallback and accessible control states', () => {
    expect(cssBlock('.analysis-conversation-history')).toContain('background: #f8f9fc');
    expect(analysisPageCss).toContain('backdrop-filter: blur(18px) saturate(135%)');
    expect(analysisPageCss).toContain('prefers-reduced-transparency');
    expect(cssBlock('.analysis-conversation-history__search-toggle')).toMatch(/transition:/u);
    expect(cssBlock('.analysis-conversation-history__search-toggle')).toMatch(/border:\s*0/u);
    expect(cssBlock('.analysis-conversation-history__search-toggle')).toMatch(
      /background:\s*transparent/u,
    );
    expect(cssBlock('.analysis-conversation-history__create')).toMatch(/border:\s*0/u);
    expect(cssBlock('.analysis-conversation-history__create')).toMatch(
      /background:\s*transparent/u,
    );
    expect(analysisPageCss).toContain(
      '.analysis-conversation-history__search-toggle:focus-visible',
    );
    expect(analysisPageCss).toContain("[aria-expanded='true']");
  });
});
