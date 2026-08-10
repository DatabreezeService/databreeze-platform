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

export interface DashboardLiveConfigurationV1 {
  readonly baseUrl: string;
  readonly dashboardId: string;
}

type DashboardEnvironment = Readonly<Record<string, unknown>>;

function configuredString(environment: DashboardEnvironment, key: string): string | undefined {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim();
}

/** DDA-020: only load live dashboard data with an explicit governed target. */
export function dashboardLiveConfiguration(
  environment: DashboardEnvironment = import.meta.env,
): DashboardLiveConfigurationV1 | undefined {
  const apiBaseUrl = configuredString(environment, 'VITE_DATABREEZE_API_BASE_URL');
  const dashboardId = configuredString(environment, 'VITE_DATABREEZE_DASHBOARD_ID');
  if (apiBaseUrl === undefined || dashboardId === undefined) return undefined;
  return Object.freeze({
    baseUrl: apiBaseUrl.replace(/\/$/u, ''),
    dashboardId,
  });
}

export function dashboardDemoMode(environment: DashboardEnvironment = import.meta.env): boolean {
  return environment['VITE_DATABREEZE_DEMO_MODE'] === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalizedTitle(value: unknown): value is { readonly vi: string; readonly en: string } {
  return isRecord(value) && typeof value['vi'] === 'string' && typeof value['en'] === 'string';
}

function isDashboardDraft(value: unknown): value is DashboardDraftFixtureV1 {
  if (!isRecord(value) || typeof value['dashboardId'] !== 'string' || typeof value['versionId'] !== 'string')
    return false;
  if (
    !Array.isArray(value['pages']) ||
    !value['pages'].every(
      (page) =>
        isRecord(page) && typeof page['pageId'] === 'string' && isLocalizedTitle(page['title']),
    )
  )
    return false;
  if (
    !Array.isArray(value['widgets']) ||
    !value['widgets'].every(
      (widget) =>
        isRecord(widget) &&
        typeof widget['widgetId'] === 'string' &&
        typeof widget['type'] === 'string' &&
        typeof widget['pageId'] === 'string' &&
        isLocalizedTitle(widget['title']) &&
        Array.isArray(widget['values']) &&
        widget['values'].every(
          (entry) =>
            isRecord(entry) && typeof entry['label'] === 'string' && typeof entry['value'] === 'string',
        ),
    )
  )
    return false;
  return (
    Array.isArray(value['filters']) &&
    value['filters'].every(
      (filter) =>
        isRecord(filter) &&
        typeof filter['filterId'] === 'string' &&
        typeof filter['field'] === 'string' &&
        typeof filter['operator'] === 'string' &&
        typeof filter['scope'] === 'string',
    ) &&
    typeof value['freshness'] === 'string' &&
    typeof value['warning'] === 'string'
  );
}

/** Typed client for a configured dashboard draft. */
export async function fetchDashboardDraft(
  configuration: DashboardLiveConfigurationV1,
  signal?: AbortSignal,
): Promise<DashboardDraftFixtureV1> {
  const response = await fetch(
    `${configuration.baseUrl}/v1/dda/dashboards/${encodeURIComponent(configuration.dashboardId)}/draft`,
    {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    },
  );
  if (!response.ok) throw new Error('DASHBOARD_DRAFT_UNAVAILABLE');
  const payload: unknown = await response.json();
  if (!isDashboardDraft(payload)) throw new Error('DASHBOARD_DRAFT_INVALID');
  return Object.freeze(payload);
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
