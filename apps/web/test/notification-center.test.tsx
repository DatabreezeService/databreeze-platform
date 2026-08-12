import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationCenter } from '../src/features/notifications/notification-center.tsx';

describe('notification center', () => {
  it('renders Vietnamese labels for content-safe items', () => {
    render(
      <NotificationCenter
        locale="vi-VN"
        items={[
          {
            eventId: 'evt-1',
            kind: 'SYNC_FAILED',
            label: 'Dong bo that bai',
            unresolved: true,
          },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Trung tâm thông báo' })).toBeTruthy();
    expect(screen.getByText('Dong bo that bai')).toBeTruthy();
  });
});
