import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataImportDrawer } from '../src/features/data/data-import-drawer.tsx';
import { MAX_SERVER_TABULAR_FILE_BYTES } from '../src/features/data/data-import-api.ts';

describe('[DDA-002][WEB-021] data import profile guard', () => {
  it('shows the live data-import limit before a file can be submitted', () => {
    expect(MAX_SERVER_TABULAR_FILE_BYTES).toBe(100 * 1024 * 1024);
    const tooLarge = new File(['x'], 'large-sales.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(tooLarge, 'size', {
      configurable: true,
      value: MAX_SERVER_TABULAR_FILE_BYTES + 1,
    });

    render(
      <DataImportDrawer
        isOpen
        locale="vi-VN"
        datasets={[]}
        initialFiles={[tooLarge]}
        maxFileBytes={MAX_SERVER_TABULAR_FILE_BYTES}
        onClose={() => undefined}
        onStartImport={() => undefined}
      />,
    );

    expect(screen.getByText('Tệp vượt quá 100 MB: large-sales.csv')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tiến hành/u })).toHaveProperty('disabled', true);
  });

  it('appends a later chooser selection instead of replacing the first upload batch', async () => {
    const user = userEvent.setup();
    const onStartImport = vi.fn();
    const first = new File(['region,amount\nNorth,10'], 'north.csv', {
      type: 'text/csv',
      lastModified: 1,
    });
    const second = new File(['region,amount\nSouth,20'], 'south.csv', {
      type: 'text/csv',
      lastModified: 2,
    });

    const { container } = render(
      <DataImportDrawer
        isOpen
        locale="en"
        datasets={[]}
        onClose={() => undefined}
        onStartImport={onStartImport}
      />,
    );
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('FILE_INPUT_MISSING');

    await user.upload(input, first);
    expect(screen.getByText('Add another CSV or XLSX file')).toBeTruthy();
    await user.upload(input, second);
    await user.click(screen.getByRole('button', { name: /Proceed to Preparation/u }));

    expect(onStartImport).toHaveBeenCalledTimes(1);
    expect(onStartImport.mock.calls[0]?.[0].files).toEqual([first, second]);
  });
});
