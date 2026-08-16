import type {
  AuthoringLayoutCell as AuthoringLayoutCellV3,
  ChartProposalField as ChartProposalFieldV3,
  ChartProposalOption as ChartProposalOptionV3,
  ChartSpan as ChartSpanV3,
  DdaDashboardAuthoringCommand as DdaDashboardAuthoringCommandV3,
  DdaDashboardAuthoringCommandResult as DdaDashboardAuthoringCommandResultV3,
  DdaDashboardChartProposal as DdaDashboardChartProposalV3,
  DdaDashboardWorkspaceHistory as DdaDashboardWorkspaceHistoryV3,
} from '@databreeze/contracts/v3';

export type DashboardWorkspaceHistoryEntryV1 = DdaDashboardWorkspaceHistoryV3['items'][number];
export type DashboardWorkspaceHistoryV1 = DdaDashboardWorkspaceHistoryV3;
export type DashboardAuthoringWidgetTypeV1 = ChartProposalOptionV3['type'];
export type DdaDashboardChartProposalFieldV1 = ChartProposalFieldV3;
export type DdaDashboardChartProposalOptionV1 = ChartProposalOptionV3;
export type DdaDashboardChartProposal = DdaDashboardChartProposalV3;
export type DdaDashboardLayoutCellV1 = AuthoringLayoutCellV3;
export type DdaDashboardChartSpanV1 = ChartSpanV3;

export type DdaDashboardAcceptProposalCommandV1 = Extract<
  DdaDashboardAuthoringCommandV3,
  { readonly kind: 'ACCEPT_PROPOSAL' }
>;
export type DdaDashboardSetLayoutCommandV1 = Extract<
  DdaDashboardAuthoringCommandV3,
  { readonly kind: 'SET_LAYOUT' }
>;
export type DdaDashboardRemoveWidgetCommandV1 = Extract<
  DdaDashboardAuthoringCommandV3,
  { readonly kind: 'REMOVE_WIDGET' }
>;
export type DdaDashboardRestoreWidgetCommandV1 = Extract<
  DdaDashboardAuthoringCommandV3,
  { readonly kind: 'RESTORE_WIDGET' }
>;
export type DdaDashboardConfigurePresentationCommandV1 = Extract<
  DdaDashboardAuthoringCommandV3,
  { readonly kind: 'CONFIGURE_PRESENTATION' }
>;
export type DdaDashboardCommandBaseV1 = Pick<
  DdaDashboardAcceptProposalCommandV1,
  | 'commandId'
  | 'createdAt'
  | 'dashboardId'
  | 'expectedRevision'
  | 'expectedVersionId'
  | 'schemaVersion'
>;
export type DdaDashboardAuthoringCommand = DdaDashboardAuthoringCommandV3;

export interface ProposeDashboardChartsInputV1 {
  readonly analysisPlanVersionId: string;
  readonly baseUrl: string;
  readonly dashboardId: string;
  readonly locale: 'en' | 'vi';
  readonly question: string;
  readonly targetPageId: string;
  readonly targetWidgetId?: string;
}

export interface ApplyDashboardAuthoringCommandInputV1 {
  readonly baseUrl: string;
  readonly command: DdaDashboardAuthoringCommand;
}

export type DashboardAuthoringCommandResultV1 = DdaDashboardAuthoringCommandResultV3;

export interface DashboardWorkspaceHistoryConfigurationV1 {
  readonly baseUrl: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export class DashboardAuthoringApiErrorV1 extends Error {
  public constructor(
    readonly code:
      | 'BUDGET_DENIED'
      | 'INVALID_COMMAND'
      | 'INVALID_PROPOSAL'
      | 'INVALID_RESPONSE'
      | 'NOT_FOUND'
      | 'REVISION_CONFLICT'
      | 'UNAUTHORIZED'
      | 'UNAVAILABLE',
    readonly serverVersionId?: string,
  ) {
    super(`DASHBOARD_AUTHORING_${code}`);
    this.name = 'DashboardAuthoringApiErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  );
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isLocalizedText(
  value: unknown,
  maximum = 200,
): value is { readonly vi: string; readonly en: string } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['vi', 'en']) &&
    typeof value['vi'] === 'string' &&
    value['vi'].length > 0 &&
    value['vi'].length <= maximum &&
    typeof value['en'] === 'string' &&
    value['en'].length > 0 &&
    value['en'].length <= maximum
  );
}

function isWidgetType(value: unknown): value is DashboardAuthoringWidgetTypeV1 {
  return (
    value === 'KPI' ||
    value === 'TABLE' ||
    value === 'BAR' ||
    value === 'LINE' ||
    value === 'AREA' ||
    value === 'PIE' ||
    value === 'DONUT' ||
    value === 'TEXT_NOTE' ||
    value === 'EVIDENCE_NOTE'
  );
}

function isSpan(value: unknown): value is DdaDashboardChartSpanV1 {
  return value === 3 || value === 4 || value === 6 || value === 8 || value === 12;
}

function isIdentifierArray(value: unknown, maximum: number): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(isIdentifier);
}

function isProposalField(value: unknown): value is DdaDashboardChartProposalFieldV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'label']) &&
    isIdentifier(value['id']) &&
    isLocalizedText(value['label'])
  );
}

function isProposalOption(value: unknown): value is DdaDashboardChartProposalOptionV1 {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'optionId',
      'type',
      'title',
      'rationale',
      'accessibilityDescription',
      'binding',
      'dimensions',
      'measures',
      'supportedSpans',
      'defaultSpan',
      'assumptions',
      'estimate',
      'evidenceBehavior',
    ]) ||
    !isIdentifier(value['optionId']) ||
    !isWidgetType(value['type']) ||
    !isLocalizedText(value['title']) ||
    !isLocalizedText(value['rationale']) ||
    !isLocalizedText(value['accessibilityDescription']) ||
    !Array.isArray(value['dimensions']) ||
    value['dimensions'].length > 32 ||
    !value['dimensions'].every(isProposalField) ||
    !Array.isArray(value['measures']) ||
    value['measures'].length > 32 ||
    !value['measures'].every(isProposalField) ||
    !Array.isArray(value['supportedSpans']) ||
    value['supportedSpans'].length < 1 ||
    value['supportedSpans'].length > 5 ||
    !value['supportedSpans'].every(isSpan) ||
    !isSpan(value['defaultSpan']) ||
    !Array.isArray(value['assumptions']) ||
    value['assumptions'].length > 16 ||
    !value['assumptions'].every(
      (item) => typeof item === 'string' && item.length > 0 && item.length <= 500,
    ) ||
    !isRecord(value['binding']) ||
    !hasOnlyKeys(value['binding'], [
      'analysisPlanVersionId',
      'materializationDefinitionId',
      'dimensionIds',
      'measureIds',
    ]) ||
    !isIdentifier(value['binding']['analysisPlanVersionId']) ||
    !isIdentifier(value['binding']['materializationDefinitionId']) ||
    !isIdentifierArray(value['binding']['dimensionIds'], 32) ||
    !isIdentifierArray(value['binding']['measureIds'], 32) ||
    !isRecord(value['estimate']) ||
    !hasOnlyKeys(value['estimate'], ['cpuMs', 'memoryMb']) ||
    !Number.isInteger(value['estimate']['cpuMs']) ||
    (value['estimate']['cpuMs'] as number) < 0 ||
    (value['estimate']['cpuMs'] as number) > 120_000 ||
    !Number.isInteger(value['estimate']['memoryMb']) ||
    (value['estimate']['memoryMb'] as number) < 0 ||
    (value['estimate']['memoryMb'] as number) > 4_096 ||
    (value['evidenceBehavior'] !== 'REQUIRED' &&
      value['evidenceBehavior'] !== 'OPTIONAL' &&
      value['evidenceBehavior'] !== 'UNAVAILABLE')
  ) {
    return false;
  }
  return true;
}

function isChartProposal(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'proposalId',
      'dashboardId',
      'parentVersionId',
      'expectedRevision',
      'analysisPlanVersionId',
      'target',
      'options',
      'summary',
      'previewOnly',
      'publishes',
      'createdAt',
    ]) ||
    value['schemaVersion'] !== 3 ||
    !isIdentifier(value['proposalId']) ||
    !isIdentifier(value['dashboardId']) ||
    !isIdentifier(value['parentVersionId']) ||
    !Number.isInteger(value['expectedRevision']) ||
    (value['expectedRevision'] as number) < 1 ||
    !isIdentifier(value['analysisPlanVersionId']) ||
    !isLocalizedText(value['summary']) ||
    !Array.isArray(value['options']) ||
    value['options'].length < 2 ||
    value['options'].length > 4 ||
    !value['options'].every(isProposalOption) ||
    value['previewOnly'] !== true ||
    value['publishes'] !== false ||
    !isUtcTimestamp(value['createdAt'])
  ) {
    return false;
  }
  const target = value['target'];
  return (
    target === undefined ||
    (isRecord(target) &&
      hasOnlyKeys(target, ['pageId', 'widgetId']) &&
      isIdentifier(target['pageId']) &&
      (target['widgetId'] === undefined || isIdentifier(target['widgetId'])))
  );
}

function isLayoutCell(value: unknown): value is DdaDashboardLayoutCellV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['widgetId', 'x', 'y', 'w', 'h']) &&
    isIdentifier(value['widgetId']) &&
    Number.isInteger(value['x']) &&
    (value['x'] as number) >= 0 &&
    (value['x'] as number) <= 11 &&
    Number.isInteger(value['y']) &&
    (value['y'] as number) >= 0 &&
    (value['y'] as number) <= 10_000 &&
    Number.isInteger(value['w']) &&
    (value['w'] as number) >= 1 &&
    (value['w'] as number) <= 12 &&
    (value['x'] as number) + (value['w'] as number) <= 12 &&
    Number.isInteger(value['h']) &&
    (value['h'] as number) >= 1 &&
    (value['h'] as number) <= 1_000
  );
}

function isDisplayOptions(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['showTitle', 'showLegend', 'showEvidence']) &&
    (value['showTitle'] === undefined || typeof value['showTitle'] === 'boolean') &&
    (value['showLegend'] === undefined || typeof value['showLegend'] === 'boolean') &&
    (value['showEvidence'] === undefined || typeof value['showEvidence'] === 'boolean')
  );
}

function isAuthoringCommand(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isIdentifier(value['commandId']) ||
    !isIdentifier(value['dashboardId']) ||
    value['schemaVersion'] !== 3 ||
    !isIdentifier(value['expectedVersionId']) ||
    !Number.isInteger(value['expectedRevision']) ||
    (value['expectedRevision'] as number) < 1 ||
    !isUtcTimestamp(value['createdAt']) ||
    typeof value['kind'] !== 'string'
  ) {
    return false;
  }
  if (value['kind'] === 'ACCEPT_PROPOSAL') {
    return (
      hasOnlyKeys(value, [
        'schemaVersion',
        'kind',
        'commandId',
        'dashboardId',
        'expectedVersionId',
        'expectedRevision',
        'proposalId',
        'selectedOptionIds',
        'createdAt',
      ]) &&
      isIdentifier(value['proposalId']) &&
      Array.isArray(value['selectedOptionIds']) &&
      value['selectedOptionIds'].length >= 1 &&
      value['selectedOptionIds'].length <= 8 &&
      value['selectedOptionIds'].every(isIdentifier) &&
      new Set(value['selectedOptionIds']).size === value['selectedOptionIds'].length
    );
  }
  if (value['kind'] === 'SET_LAYOUT') {
    return (
      hasOnlyKeys(value, [
        'schemaVersion',
        'kind',
        'commandId',
        'dashboardId',
        'expectedVersionId',
        'expectedRevision',
        'breakpoint',
        'cells',
        'createdAt',
      ]) &&
      (value['breakpoint'] === 'desktop' ||
        value['breakpoint'] === 'tablet' ||
        value['breakpoint'] === 'mobile') &&
      Array.isArray(value['cells']) &&
      value['cells'].length <= 128 &&
      value['cells'].every(isLayoutCell)
    );
  }
  if (value['kind'] === 'REMOVE_WIDGET' || value['kind'] === 'RESTORE_WIDGET') {
    return (
      hasOnlyKeys(value, [
        'schemaVersion',
        'kind',
        'commandId',
        'dashboardId',
        'expectedVersionId',
        'expectedRevision',
        'widgetId',
        'createdAt',
      ]) && isIdentifier(value['widgetId'])
    );
  }
  return (
    value['kind'] === 'CONFIGURE_PRESENTATION' &&
    hasOnlyKeys(value, [
      'schemaVersion',
      'kind',
      'commandId',
      'dashboardId',
      'expectedVersionId',
      'expectedRevision',
      'widgetId',
      'title',
      'display',
      'createdAt',
    ]) &&
    isIdentifier(value['widgetId']) &&
    (value['title'] === undefined || isLocalizedText(value['title'])) &&
    (value['display'] === undefined || isDisplayOptions(value['display']))
  );
}

function isHistoryEntry(value: unknown): value is DashboardWorkspaceHistoryEntryV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'subjectId', 'title', 'updatedAt', 'safeStatus']) &&
    (value['kind'] === 'ANALYSIS' || value['kind'] === 'DASHBOARD') &&
    isIdentifier(value['subjectId']) &&
    isLocalizedText(value['title']) &&
    isUtcTimestamp(value['updatedAt']) &&
    (value['safeStatus'] === undefined ||
      value['safeStatus'] === 'CURRENT' ||
      value['safeStatus'] === 'STALE' ||
      value['safeStatus'] === 'BLOCKED')
  );
}

function isWorkspaceHistory(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['schemaVersion', 'items', 'nextCursor']) &&
    value['schemaVersion'] === 3 &&
    Array.isArray(value['items']) &&
    value['items'].length <= 50 &&
    value['items'].every(isHistoryEntry) &&
    (value['nextCursor'] === undefined ||
      (typeof value['nextCursor'] === 'string' && value['nextCursor'].length <= 512))
  );
}

function isAuthoringCommandResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'commandId',
      'dashboardId',
      'versionId',
      'revision',
      'savedAt',
      'publishes',
    ]) &&
    isIdentifier(value['commandId']) &&
    isIdentifier(value['dashboardId']) &&
    isIdentifier(value['versionId']) &&
    Number.isInteger(value['revision']) &&
    (value['revision'] as number) >= 1 &&
    isUtcTimestamp(value['savedAt']) &&
    value['publishes'] === false
  );
}

async function apiErrorFor(response: Response): Promise<DashboardAuthoringApiErrorV1> {
  if (response.status === 401 || response.status === 403) {
    return new DashboardAuthoringApiErrorV1('UNAUTHORIZED');
  }
  if (response.status === 404) return new DashboardAuthoringApiErrorV1('NOT_FOUND');
  if (response.status === 422) return new DashboardAuthoringApiErrorV1('INVALID_PROPOSAL');
  if (response.status === 429) return new DashboardAuthoringApiErrorV1('BUDGET_DENIED');
  if (response.status !== 409) return new DashboardAuthoringApiErrorV1('UNAVAILABLE');

  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isIdentifier(payload['currentVersionId'])) {
      return new DashboardAuthoringApiErrorV1('REVISION_CONFLICT', payload['currentVersionId']);
    }
  } catch {
    // Expose no server error-body content other than a validated version identifier.
  }
  return new DashboardAuthoringApiErrorV1('REVISION_CONFLICT');
}

function workspaceHistoryUrl(configuration: DashboardWorkspaceHistoryConfigurationV1): string {
  const url = new URL('/v3/dda/dashboards/workspace-history', configuration.baseUrl);
  if (configuration.cursor !== undefined) url.searchParams.set('cursor', configuration.cursor);
  if (configuration.limit !== undefined) url.searchParams.set('limit', String(configuration.limit));
  return url.toString();
}

/** DDA-026/DDA-043: request only the current-session, content-safe history page. */
export async function fetchDashboardWorkspaceHistory(
  configuration: DashboardWorkspaceHistoryConfigurationV1,
  signal?: AbortSignal,
): Promise<DashboardWorkspaceHistoryV1> {
  const init: RequestInit = {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  };
  if (signal !== undefined) init.signal = signal;

  const response = await globalThis.fetch(workspaceHistoryUrl(configuration), init);
  if (!response.ok) throw await apiErrorFor(response);

  const payload: unknown = await response.json();
  if (!isWorkspaceHistory(payload)) throw new DashboardAuthoringApiErrorV1('INVALID_RESPONSE');
  return Object.freeze(payload as DashboardWorkspaceHistoryV1);
}

/** DDA-024: request preview-only chart alternatives; this never accepts or publishes a canvas change. */
export async function proposeDashboardCharts(
  input: ProposeDashboardChartsInputV1,
  signal?: AbortSignal,
): Promise<DdaDashboardChartProposal> {
  const init: RequestInit = {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      question: input.question,
      analysisPlanVersionId: input.analysisPlanVersionId,
      targetPageId: input.targetPageId,
      ...(input.targetWidgetId === undefined ? {} : { targetWidgetId: input.targetWidgetId }),
      locale: input.locale,
    }),
  };
  if (signal !== undefined) init.signal = signal;

  const url = new URL(
    `/v3/dda/dashboards/${encodeURIComponent(input.dashboardId)}/proposals`,
    input.baseUrl,
  );
  const response = await globalThis.fetch(url.toString(), init);
  if (!response.ok) throw await apiErrorFor(response);

  const payload: unknown = await response.json();
  if (!isChartProposal(payload)) throw new DashboardAuthoringApiErrorV1('INVALID_RESPONSE');
  return Object.freeze(payload as DdaDashboardChartProposal);
}

/** DDA-020/DDA-022/DDA-024: submit only a confirmed, bounded command with an idempotency key. */
export async function applyDashboardAuthoringCommand(
  input: ApplyDashboardAuthoringCommandInputV1,
  signal?: AbortSignal,
): Promise<DashboardAuthoringCommandResultV1> {
  if (!isAuthoringCommand(input.command)) {
    throw new DashboardAuthoringApiErrorV1('INVALID_COMMAND');
  }

  const init: RequestInit = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      'Idempotency-Key': input.command.commandId,
    },
    credentials: 'include',
    body: JSON.stringify(input.command),
  };
  if (signal !== undefined) init.signal = signal;

  const url = new URL(
    `/v3/dda/dashboards/${encodeURIComponent(input.command.dashboardId)}/authoring-commands`,
    input.baseUrl,
  );
  const response = await globalThis.fetch(url.toString(), init);
  if (!response.ok) throw await apiErrorFor(response);

  const payload: unknown = await response.json();
  if (!isAuthoringCommandResult(payload)) {
    throw new DashboardAuthoringApiErrorV1('INVALID_RESPONSE');
  }
  return Object.freeze(payload as DashboardAuthoringCommandResultV1);
}
