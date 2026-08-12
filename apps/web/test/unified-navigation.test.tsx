import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import {
  UDW_PRIMARY_NAV_ITEMS_V1,
  udwPrimaryNavLabelsV1,
} from '../src/app/unified-primary-navigation.ts';

describe('unified primary navigation', () => {
  it('exposes exactly three primary destinations', () => {
    expect(UDW_PRIMARY_NAV_ITEMS_V1).toHaveLength(3);
    expect(UDW_PRIMARY_NAV_ITEMS_V1.map((item) => item.key)).toEqual([
      'dashboards',
      'analysis',
      'data',
    ]);
  });

  it('uses Vietnamese and English labels without em dashes', () => {
    const vi = udwPrimaryNavLabelsV1('vi-VN');
    const en = udwPrimaryNavLabelsV1('en');
    expect(vi).toEqual(['Bảng điều khiển', 'Phân tích', 'Dữ liệu']);
    expect(en).toEqual(['Dashboards', 'Analysis', 'Data']);
    expect([...vi, ...en].every((label) => !label.includes('—'))).toBe(true);
  });

  it('renders only the three primary links in the signed-in shell', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('link', { name: 'Bảng điều khiển' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Hộp thư đến' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Jobs' })).toBeNull();
  });
});
