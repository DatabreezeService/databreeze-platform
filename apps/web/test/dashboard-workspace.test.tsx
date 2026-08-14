import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { workspaceAgentStore } from '../src/features/agent/workspace-agent-store.ts';
import { DashboardWorkspace } from '../src/features/dashboards/dashboard-workspace.tsx';

const dashboardId = '00000000-0000-4000-8000-00000000001b';
const analysisId = '00000000-0000-4000-8000-000000000031';

const historyItems = [
  { id: dashboardId, kind: 'dashboard' as const, title: 'Sales overview' },
  { id: analysisId, kind: 'analysis' as const, title: 'Revenue by region' },
];

function DestinationProbe() {
  const location = useLocation();
  const state = location.state as {
    historySubject?: { kind?: string; subjectId?: string };
  } | null;
  return (
    <output data-testid="destination">
      {location.pathname}
      {location.search}|{state?.historySubject?.kind ?? ''}|{state?.historySubject?.subjectId ?? ''}
    </output>
  );
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/en/dashboards']}>
      <DashboardWorkspace historyItems={historyItems} locale="en">
        <DestinationProbe />
      </DashboardWorkspace>
    </MemoryRouter>,
  );
}

describe('dashboard workspace history activation [DDA-055, DDA-056, WEB-024]', () => {
  afterEach(() => {
    workspaceAgentStore.setActiveConversation(undefined);
  });

  it('navigates to and scopes the selected dashboard subject', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Sales overview' }));

    expect(screen.getByTestId('destination').textContent).toContain(
      `/en/dashboards?dashboard=${dashboardId}|DASHBOARD|${dashboardId}`,
    );
  });

  it('navigates to an analysis subject and carries its authorized summary for the shared store', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Revenue by region' }));

    expect(screen.getByTestId('destination').textContent).toContain(
      `/en/analysis?conversation=${analysisId}|ANALYSIS|${analysisId}`,
    );
    expect(workspaceAgentStore.getActiveConversation()).toEqual({
      conversationId: analysisId,
      title: 'Revenue by region',
      datasetLabel: 'Authorized history subject',
      datasetVersionLabel: 'Authorized history subject',
    });
  });
});
