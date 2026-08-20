import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dataFeatureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/features/data',
);
const dataWorkspaceCss = readFileSync(
  path.join(dataFeatureDirectory, 'data-workspace.css'),
  'utf8',
);
const importReviewCss = readFileSync(
  path.join(dataFeatureDirectory, 'import-review-workspace.css'),
  'utf8',
);
const dataImportDrawerCss = readFileSync(
  path.join(dataFeatureDirectory, 'data-import-drawer.css'),
  'utf8',
);
const importSuccessCss = readFileSync(
  path.join(dataFeatureDirectory, 'import-success-hub.css'),
  'utf8',
);

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = css.match(new RegExp(`${escaped}[^\\{]*\\{([^}]*)\\}`, 'u'));
  return match?.[1] ?? '';
}

describe('Data page surface contrast [WEB-020][WEB-024]', () => {
  it('keeps the page title on the canvas while preserving the raised workspace card below', () => {
    const routePage = cssBlock(dataWorkspaceCss, '.data-route-page');
    const workspace = cssBlock(dataWorkspaceCss, '.data-workspace-shell');
    const heading = cssBlock(dataWorkspaceCss, '.data-workspace-shell__heading');

    expect(routePage).toContain('#f5f7fb');
    expect(routePage).toContain('min-height: max(100%, 100dvh);');
    expect(routePage).toContain('margin: -80px -28px -28px;');
    expect(workspace).toContain('background: transparent;');
    expect(workspace).toContain('border: 0;');
    expect(workspace).toContain('box-shadow: none;');
    expect(workspace).toContain('--dw-ink: #102a63;');
    expect(workspace).toContain('--dw-muted: #405776;');
    expect(workspace).toContain('--dw-dim: #52698f;');
    expect(heading).toContain('border-bottom: 0;');
  });

  it('uses the authenticated workspace font stack across Data copy and controls', () => {
    const routePage = cssBlock(dataWorkspaceCss, '.data-route-page');

    expect(routePage).toContain('font-family:');
    expect(routePage).toContain('Geist');
    expect(routePage).toContain("'Be Vietnam Pro'");
    expect(routePage).toContain('Noto Sans');
    expect(routePage).toContain("'Segoe UI'");
  });

  it('keeps loading, error, and import-review copy on light readable surfaces', () => {
    expect(cssBlock(dataWorkspaceCss, '.data-route-state__notice')).toContain('color: #405776;');
    expect(cssBlock(dataWorkspaceCss, '.data-route-state__notice--error')).toContain(
      'color: #b42318;',
    );
    expect(importReviewCss).toContain('background: #ffffff;');
    expect(importReviewCss).toContain('color: #102a63;');
    expect(importReviewCss).toContain('color: #b42318;');
    expect(importReviewCss).not.toContain('color: #f7f7ff;');
    expect(importReviewCss).not.toContain('color: #a9aed2;');
  });

  it('places route errors directly on the canvas instead of a large white panel', () => {
    const errorState = cssBlock(dataWorkspaceCss, '.data-route-state--error');
    const errorHeading = cssBlock(
      dataWorkspaceCss,
      '.data-route-state--error .data-route-state__heading h1',
    );

    expect(errorState).toContain('background: transparent;');
    expect(errorState).toContain('border: 0;');
    expect(errorState).toContain('box-shadow: none;');
    expect(errorState).toContain('padding: 0 4px;');
    expect(errorHeading).toContain('font-weight: 700;');
    expect(dataWorkspaceCss).toContain('.data-route-state--error .data-route-state__notice--error');
    expect(dataWorkspaceCss).toContain('.data-route-state--error .data-route-state__heading h1');
    expect(dataWorkspaceCss).toContain('color: #102a63;');
    expect(dataWorkspaceCss).toContain('.data-route-state--error .data-route-state__heading p');
    expect(dataWorkspaceCss).toContain('color: #405776;');
    expect(dataWorkspaceCss).toContain('border: 0;');
    expect(dataWorkspaceCss).toContain('box-shadow: none;');
    expect(dataWorkspaceCss).toContain('color: #9f1d16;');
    expect(dataWorkspaceCss).toContain('background: transparent;');
  });

  it('keeps the loading state directly on the canvas without a white panel', () => {
    const loadingState = cssBlock(dataWorkspaceCss, '.data-route-state--loading');
    const loadingNotice = cssBlock(
      dataWorkspaceCss,
      '.data-route-state--loading .data-route-state__notice',
    );
    const loadingHeading = cssBlock(
      dataWorkspaceCss,
      '.data-route-state--loading .data-route-state__heading h1',
    );

    expect(loadingState).toContain('background: transparent;');
    expect(loadingState).toContain('border: 0;');
    expect(loadingState).toContain('box-shadow: none;');
    expect(loadingState).toContain('padding: 0 4px;');
    expect(loadingNotice).toContain('color: #405776;');
    expect(loadingNotice).toContain('background: transparent;');
    expect(loadingNotice).toContain('border: 0;');
    expect(loadingNotice).toContain('box-shadow: none;');
    expect(loadingHeading).toContain('font-weight: 700;');
    expect(loadingHeading).toContain('color: #102a63;');
  });

  it('gives the workspace a layered surface hierarchy with an intentional upload entry', () => {
    expect(dataWorkspaceCss).toContain('backdrop-filter: blur(14px) saturate(130%);');
    expect(dataWorkspaceCss).toContain('border: 1px dashed #a9bcda;');
    expect(dataWorkspaceCss).toContain('background: #f7f9fd;');
    expect(dataWorkspaceCss).toContain('@media (max-width: 720px)');
    expect(dataWorkspaceCss).toContain('@media (prefers-reduced-transparency: reduce)');
  });

  it('keeps the upload entry in the empty workspace instead of the page title region', () => {
    const workspacePage = readFileSync(
      path.join(dataFeatureDirectory, 'data-workspace-page.tsx'),
      'utf8',
    );
    const titleHeader = workspacePage.match(
      /<header className="data-workspace-shell__heading">([\s\S]*?)<\/header>/u,
    )?.[1];

    expect(titleHeader).toBeDefined();
    expect(titleHeader).not.toContain('db-button');
    expect(workspacePage).toContain('className="root-overview__actions"');
    expect(workspacePage).toContain("vi ? '+ Thêm dữ liệu' : '+ Add data'");
  });

  it('keeps import drawer and completion states readable in the light Data language', () => {
    expect(dataImportDrawerCss).toContain('--drawer-ink: #102a63;');
    expect(dataImportDrawerCss).toContain('background: #ffffff;');
    expect(dataImportDrawerCss).toContain('background: #fff1f0;');
    expect(dataImportDrawerCss).toContain('@media (max-width: 600px)');
    expect(importSuccessCss).toContain('box-shadow: 0 4px 8px rgb(29 64 116 / 10%);');
    expect(importSuccessCss).toContain('background: #eef2ff;');
  });
});
