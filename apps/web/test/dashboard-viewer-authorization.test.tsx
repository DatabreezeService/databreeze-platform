import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardViewer } from '../src/features/dashboards/dashboard-viewer.tsx';

describe('dashboard viewer authorization [DDA-026]', () => {
  it('renders permission-filtered rows and states sharing does not expand source permissions', () => {
    render(<DashboardViewer locale="en" permissionExpansionDenied rows={[{ region: 'North' }]} />);
    expect(screen.getByText('Sharing does not expand source permissions.')).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();
    expect(screen.queryByText('salary_secret')).toBeNull();
  });

  it('shows denied state without leaking hidden field names', () => {
    render(<DashboardViewer locale="en" permissionExpansionDenied denied rows={[]} />);
    expect(screen.getByText('View denied')).toBeTruthy();
    expect(screen.queryByText(/secret/iu)).toBeNull();
  });
});
