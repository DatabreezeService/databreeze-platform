export interface DashboardDraftFixtureV1 {
  readonly dashboardId: string;
  readonly versionId: string;
  readonly pages: readonly {
    readonly pageId: string;
    readonly title: { readonly vi: string; readonly en: string };
  }[];
  readonly widgets: readonly {
    readonly widgetId: string;
    readonly type: string;
    readonly pageId: string;
    readonly title: { readonly vi: string; readonly en: string };
    readonly values: readonly { readonly label: string; readonly value: string }[];
  }[];
  readonly filters: readonly {
    readonly filterId: string;
    readonly field: string;
    readonly operator: string;
    readonly scope: string;
  }[];
  readonly freshness: string;
  readonly warning: string;
}

/** Typed client for dashboard drafts — fixture-backed until 087 wires live API. */
export async function fetchDashboardDraft(
  dashboardId: string,
  fixture?: DashboardDraftFixtureV1,
): Promise<DashboardDraftFixtureV1> {
  if (fixture) return fixture;
  const response = await fetch(`/v1/dda/dashboards/${dashboardId}/draft`);
  if (!response.ok) throw new Error('DASHBOARD_DRAFT_UNAVAILABLE');
  return (await response.json()) as DashboardDraftFixtureV1;
}

export async function acceptDashboardProposal(input: {
  readonly proposalId: string;
  readonly dashboardId: string;
}): Promise<{ readonly draftOnly: true; readonly versionId: string }> {
  void input;
  return Object.freeze({
    draftOnly: true as const,
    versionId: '00000000-0000-4000-8000-000000000011',
  });
}
