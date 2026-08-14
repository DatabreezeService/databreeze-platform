import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createAutomaticWidgetCells,
  createMobileWidgetCells,
  normalizeWidgetCells,
  ResponsiveWidgetGrid,
  type DashboardWidgetLayoutsV1,
} from '../src/features/dashboards/responsive-widget-grid.tsx';

const widgetIds = ['revenue', 'orders', 'margin'] as const;

describe('responsive widget grid [DDA-020][DDA-022][WEB-014]', () => {
  it('packs requested 3/4/6/8/12 spans across a bounded 12-column row', () => {
    const cells = createAutomaticWidgetCells([
      { widgetId: 'revenue', span: 6, minH: 4 },
      { widgetId: 'orders', span: 6, minH: 3 },
      { widgetId: 'margin', span: 4, minH: 3 },
      { widgetId: 'forecast', span: 8, minH: 3 },
      { widgetId: 'coverage', span: 3, minH: 3 },
      { widgetId: 'detail', span: 12, minH: 5 },
    ]);

    expect(cells).toEqual([
      { widgetId: 'revenue', x: 0, y: 0, w: 6, h: 4 },
      { widgetId: 'orders', x: 6, y: 0, w: 6, h: 3 },
      { widgetId: 'margin', x: 0, y: 4, w: 4, h: 3 },
      { widgetId: 'forecast', x: 4, y: 4, w: 8, h: 3 },
      { widgetId: 'coverage', x: 0, y: 7, w: 3, h: 3 },
      { widgetId: 'detail', x: 0, y: 10, w: 12, h: 5 },
    ]);
    expect(cells.every((cell) => cell.x >= 0 && cell.x + cell.w <= 12)).toBe(true);
  });

  it('creates a stable, deterministic vertical stack for mobile', () => {
    const mobile = createMobileWidgetCells([
      { widgetId: 'orders', x: 6, y: 0, w: 6, h: 3 },
      { widgetId: 'revenue', x: 0, y: 0, w: 6, h: 4 },
      { widgetId: 'margin', x: 0, y: 4, w: 4, h: 3 },
    ]);

    expect(mobile).toEqual([
      { widgetId: 'revenue', x: 0, y: 0, w: 12, h: 4 },
      { widgetId: 'orders', x: 0, y: 4, w: 12, h: 3 },
      { widgetId: 'margin', x: 0, y: 7, w: 12, h: 3 },
    ]);
  });

  it('clamps out-of-bounds cells and rejects ambiguous duplicate widget IDs', () => {
    const result = normalizeWidgetCells([
      { widgetId: 'revenue', x: 10, y: -2, w: 7, h: 0 },
      { widgetId: 'revenue', x: 0, y: 0, w: 6, h: 3 },
    ]);

    expect(result.cells).toEqual([{ widgetId: 'revenue', x: 4, y: 0, w: 8, h: 2 }]);
    expect(result.rejectedWidgetIds).toEqual(['revenue']);
  });

  it('emits a bounded SET_LAYOUT command immediately after a keyboard edit for autosave', async () => {
    const user = userEvent.setup();
    const onLayoutCommand = vi.fn();
    const layouts: DashboardWidgetLayoutsV1 = {
      desktop: [
        { widgetId: 'revenue', x: 0, y: 0, w: 6, h: 4 },
        { widgetId: 'orders', x: 6, y: 4, w: 6, h: 3 },
        { widgetId: 'margin', x: 0, y: 4, w: 4, h: 3 },
      ],
      tablet: [
        { widgetId: 'revenue', x: 0, y: 0, w: 6, h: 4 },
        { widgetId: 'orders', x: 6, y: 4, w: 6, h: 3 },
        { widgetId: 'margin', x: 0, y: 4, w: 4, h: 3 },
      ],
      mobile: [
        { widgetId: 'revenue', x: 0, y: 0, w: 12, h: 4 },
        { widgetId: 'orders', x: 0, y: 4, w: 12, h: 3 },
        { widgetId: 'margin', x: 0, y: 7, w: 12, h: 3 },
      ],
    };

    render(
      <ResponsiveWidgetGrid
        locale="en"
        breakpoint="desktop"
        widgetIds={widgetIds}
        layouts={layouts}
        onLayoutCommand={onLayoutCommand}
        renderWidget={(widgetId, controls) => (
          <button type="button" onClick={() => controls.move('right')}>
            Move {widgetId} right
          </button>
        )}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Move revenue right' }));
    expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull();

    expect(onLayoutCommand).toHaveBeenCalledWith({
      kind: 'SET_LAYOUT',
      breakpoint: 'desktop',
      cells: [
        { widgetId: 'revenue', x: 3, y: 0, w: 6, h: 4 },
        { widgetId: 'orders', x: 6, y: 4, w: 6, h: 3 },
        { widgetId: 'margin', x: 0, y: 4, w: 4, h: 3 },
      ],
    });
  });

  it('renders draggable grid items with resize handles for pointer authoring', () => {
    const { container } = render(
      <ResponsiveWidgetGrid
        locale="en"
        breakpoint="tablet"
        widgetIds={widgetIds}
        renderWidget={(widgetId) => <div>{widgetId}</div>}
      />,
    );

    expect(container.querySelectorAll('.react-grid-item')).toHaveLength(widgetIds.length);
    expect(container.querySelectorAll('.react-resizable-handle')).toHaveLength(widgetIds.length);
  });
});
