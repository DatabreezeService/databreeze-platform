import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTreeSidebar } from '../src/features/data/data-tree-sidebar.tsx';

function renderTree(locale: 'en' | 'vi-VN' = 'vi-VN') {
  return render(
    <DataTreeSidebar
      locale={locale}
      projects={[]}
      records={[]}
      selection={{ kind: 'root' }}
      onSelect={vi.fn()}
      onCreateProject={vi.fn()}
      onRenameProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onAddData={vi.fn()}
      allowProjectManagement={false}
    />,
  );
}

describe('Data tree root icon', () => {
  it('uses a product SVG that inherits the root label color and keeps selection behavior', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DataTreeSidebar
        locale="vi-VN"
        projects={[]}
        records={[]}
        selection={{ kind: 'root' }}
        onSelect={onSelect}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onAddData={vi.fn()}
        allowProjectManagement={false}
      />,
    );

    const root = screen.getByRole('button', { name: /Tất cả dữ liệu\s*0/u });
    const icon = root.querySelector('svg.data-tree__root-icon');

    expect(root.textContent).not.toContain('🗂️');
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute('stroke')).toBe('currentColor');

    await user.click(root);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'root' });
  });

  it('keeps the English root label unchanged', () => {
    renderTree('en');

    const root = screen.getByRole('button', { name: /All data\s*0/u });
    expect(root.querySelector('svg.data-tree__root-icon')).toBeTruthy();
  });
});
