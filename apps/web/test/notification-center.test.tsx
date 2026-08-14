import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
            state: 'UNREAD',
          },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Trung tâm thông báo' })).toBeTruthy();
    expect(screen.getByText('Dong bo that bai')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders truthful loading, error, and empty states in English', () => {
    const { rerender } = render(
      <NotificationCenter locale="en" state={{ status: 'loading', items: [] }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Loading notifications…');

    rerender(<NotificationCenter locale="en" state={{ status: 'error', items: [] }} />);
    expect(screen.getByRole('status').textContent).toContain('Notifications could not load.');

    rerender(<NotificationCenter locale="en" state={{ status: 'empty', items: [] }} />);
    expect(screen.getByRole('status').textContent).toContain('No notifications yet.');
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('does not invent entries, bounds items, and only links safe supplied routes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/en/dashboards']}>
        <NotificationCenter
          locale="en"
          maxItems={2}
          state={{
            status: 'ready',
            items: [
              {
                eventId: 'evt-1',
                kind: 'REVIEW_REQUIRED',
                label: 'Review required',
                unresolved: true,
                state: 'UNREAD',
                actionRoute: '/en/inbox',
              },
              {
                eventId: 'evt-2',
                kind: 'SYNC_FAILED',
                label: 'Sync needs attention',
                unresolved: true,
                state: 'READ',
              },
              {
                eventId: 'evt-3',
                kind: 'SECURITY_NOTICE',
                label: 'Protected detail',
                unresolved: true,
                state: 'UNREAD',
                actionRoute: 'https://example.test/not-safe',
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Review required')).toBeTruthy();
    expect(screen.getByText('Sync needs attention')).toBeTruthy();
    expect(screen.queryByText('Protected detail')).toBeNull();
    expect(screen.getByRole('link', { name: 'Review required' }).getAttribute('href')).toBe(
      '/en/inbox',
    );
    expect(screen.queryByRole('link', { name: 'Protected detail' })).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();

    await user.tab();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link')));
  });

  it('uses a generic security label instead of rendering protected details', () => {
    render(
      <NotificationCenter
        locale="vi-VN"
        state={{
          status: 'ready',
          items: [
            {
              eventId: 'security-1',
              kind: 'SECURITY_NOTICE',
              label: 'Protected detail',
              unresolved: true,
              state: 'UNREAD',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Thông báo bảo mật')).toBeTruthy();
    expect(screen.queryByText('Protected detail')).toBeNull();
  });
});
