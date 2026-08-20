import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DATABREEZE_MARK_SRC } from '../src/app/brand-assets.ts';
import { DataAgentDock } from '../src/features/data/data-agent-dock.tsx';

const dataWorkspaceCss = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/features/data/data-workspace.css',
  ),
  'utf8',
);

describe('[DDA-053][WEB-020] Data agent logo', () => {
  it('uses the canonical Dashboard agent mark and avatar treatment', () => {
    const { container } = render(
      <DataAgentDock
        datasetId="dataset-agent-logo"
        datasetLabel="Bán hàng"
        locale="vi-VN"
        onApprove={() => undefined}
        onClose={() => undefined}
      />,
    );

    const avatar = container.querySelector('.agent-dock__avatar');
    const logo = avatar?.querySelector<HTMLImageElement>('img');

    expect(avatar).toBeTruthy();
    expect(logo).toBeTruthy();
    expect(logo?.getAttribute('src')).toBe(DATABREEZE_MARK_SRC);
    expect(logo?.getAttribute('alt')).toBe('');
    expect(container.textContent).not.toContain('✦');
    expect(dataWorkspaceCss).toContain('.agent-dock__avatar img');
    expect(dataWorkspaceCss).toContain('background: #121844;');
    expect(dataWorkspaceCss).toContain('object-fit: contain;');
  });
});
