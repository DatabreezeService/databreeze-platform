import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationCenter } from '../src/renderer/workbench/notification-center.tsx';

describe('Desktop notification center', () => {
  it('renders in-app fallback labels in Vietnamese', () => {
    render(
      <NotificationCenter locale="vi-VN" items={[{ id: '1', label: 'Dong bo that bai' }]} />,
    );
    expect(screen.getByRole('region', { name: 'Trung tâm thông báo' })).toBeTruthy();
    expect(screen.getByText('Dong bo that bai')).toBeTruthy();
  });
});
