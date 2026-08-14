import type {
  DashboardWorkspaceHistoryEntryV1,
  DashboardWorkspaceHistoryV1,
  DdaDashboardChartProposal,
  DdaDashboardLayoutCellV1,
} from './dashboard-authoring-api.ts';

export interface DashboardAuthoringViewV1 {
  readonly dashboardId: string;
  readonly revision: number;
  readonly versionId: string;
}

export interface DashboardAuthoringStateV1 {
  readonly activeProposal?: DdaDashboardChartProposal | undefined;
  readonly conflict?: { readonly serverVersionId: string } | undefined;
  readonly currentDraft: DashboardAuthoringViewV1;
  readonly history: DashboardAuthoringHistoryStateV1;
  readonly lastAuthorizedLayout?: DashboardAuthoringLayoutV1 | undefined;
  readonly lastAuthorizedView: DashboardAuthoringViewV1;
  readonly lastErrorCode?: string | undefined;
  readonly optimisticLayout?: DashboardAuthoringLayoutV1 | undefined;
  readonly pendingAction?: 'ACCEPT_PROPOSAL' | 'SAVE' | undefined;
  readonly saveState: 'IDLE' | 'SAVING' | 'SAVED' | 'FAILED' | 'CONFLICT';
  readonly selectedOptionIds: readonly string[];
  readonly undoTarget?: DashboardAuthoringUndoTargetV1 | undefined;
}

export interface DashboardAuthoringHistoryStateV1 {
  readonly errorCode?: string;
  readonly items: readonly DashboardWorkspaceHistoryEntryV1[];
  readonly loadState: 'IDLE' | 'LOADING' | 'READY' | 'FAILED';
  readonly nextCursor?: string;
}

export type DashboardAuthoringEventV1 =
  | { readonly type: 'PROPOSAL_RECEIVED'; readonly proposal: DdaDashboardChartProposal }
  | { readonly type: 'OPTION_TOGGLED'; readonly optionId: string }
  | { readonly type: 'ACCEPT_STARTED' }
  | { readonly type: 'SAVE_STARTED' }
  | { readonly type: 'SAVE_SUCCEEDED'; readonly versionId: string; readonly revision: number }
  | { readonly type: 'SAVE_FAILED'; readonly code: string }
  | { readonly type: 'CONFLICT'; readonly serverVersionId: string }
  | {
      readonly type: 'AUTHORIZED_VIEW_RELOADED';
      readonly view: DashboardAuthoringViewV1;
      readonly layout?: DashboardAuthoringLayoutV1;
    }
  | { readonly type: 'UNDO_AVAILABLE'; readonly versionId: string };

export interface DashboardAuthoringLayoutV1 {
  readonly breakpoint: 'desktop' | 'tablet' | 'mobile';
  readonly cells: readonly DdaDashboardLayoutCellV1[];
}

export interface DashboardAuthoringUndoTargetV1 {
  readonly capability: 'VERSION_RESTORE_UNSUPPORTED' | 'WIDGET_RESTORE';
  readonly priorVersionId: string;
  readonly widgetId?: string;
}

export type DashboardAuthoringStoreEventV1 =
  | DashboardAuthoringEventV1
  | { readonly type: 'LAYOUT_CHANGED'; readonly layout: DashboardAuthoringLayoutV1 }
  | { readonly type: 'HISTORY_PAGE_LOADING' }
  | {
      readonly type: 'HISTORY_PAGE_RECEIVED';
      readonly append: boolean;
      readonly history: DashboardWorkspaceHistoryV1;
    }
  | { readonly type: 'HISTORY_PAGE_FAILED'; readonly code: string }
  | {
      readonly type: 'UNDO_WIDGET_AVAILABLE';
      readonly priorVersionId: string;
      readonly widgetId: string;
    };

function freezeView(view: DashboardAuthoringViewV1): DashboardAuthoringViewV1 {
  return Object.freeze({ ...view });
}

function freezeLayout(layout: DashboardAuthoringLayoutV1): DashboardAuthoringLayoutV1 {
  return Object.freeze({
    breakpoint: layout.breakpoint,
    cells: Object.freeze(layout.cells.map((cell) => Object.freeze({ ...cell }))),
  });
}

function freezeHistory(
  items: readonly DashboardWorkspaceHistoryEntryV1[],
  loadState: DashboardAuthoringHistoryStateV1['loadState'],
  nextCursor?: string,
  errorCode?: string,
): DashboardAuthoringHistoryStateV1 {
  return Object.freeze({
    items: Object.freeze(
      items.map((item) => Object.freeze({ ...item, title: Object.freeze({ ...item.title }) })),
    ),
    loadState,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    ...(errorCode === undefined ? {} : { errorCode }),
  });
}

export function createDashboardAuthoringState(
  currentDraft: DashboardAuthoringViewV1,
): DashboardAuthoringStateV1 {
  const view = freezeView(currentDraft);
  return Object.freeze({
    currentDraft: view,
    lastAuthorizedView: view,
    history: freezeHistory([], 'IDLE'),
    saveState: 'IDLE' as const,
    selectedOptionIds: Object.freeze([]),
  });
}

/** DDA-024: only the current immutable version may accept a preview proposal. */
export function dashboardAuthoringReducer(
  state: DashboardAuthoringStateV1,
  event: DashboardAuthoringStoreEventV1,
): DashboardAuthoringStateV1 {
  if (event.type === 'PROPOSAL_RECEIVED') {
    if (
      event.proposal.dashboardId !== state.currentDraft.dashboardId ||
      event.proposal.parentVersionId !== state.currentDraft.versionId ||
      event.proposal.expectedRevision !== state.currentDraft.revision
    ) {
      return state;
    }
    return Object.freeze({
      ...state,
      activeProposal: event.proposal,
      selectedOptionIds: Object.freeze([]),
    });
  }

  if (event.type === 'OPTION_TOGGLED') {
    const activeProposal = state.activeProposal;
    if (
      activeProposal === undefined ||
      !activeProposal.options.some((option) => option.optionId === event.optionId)
    ) {
      return state;
    }
    const selected = state.selectedOptionIds.includes(event.optionId)
      ? state.selectedOptionIds.filter((optionId) => optionId !== event.optionId)
      : [...state.selectedOptionIds, event.optionId];
    return Object.freeze({ ...state, selectedOptionIds: Object.freeze(selected) });
  }

  if (event.type === 'LAYOUT_CHANGED') {
    return Object.freeze({
      ...state,
      optimisticLayout: freezeLayout(event.layout),
      saveState: state.saveState === 'SAVING' ? 'SAVING' : 'IDLE',
      conflict: undefined,
      lastErrorCode: undefined,
    });
  }

  if (event.type === 'HISTORY_PAGE_LOADING') {
    return Object.freeze({
      ...state,
      history: freezeHistory(state.history.items, 'LOADING', state.history.nextCursor),
    });
  }

  if (event.type === 'HISTORY_PAGE_RECEIVED') {
    const existingIds = new Set(state.history.items.map((item) => item.subjectId));
    const appendedItems = event.history.items.filter((item) => !existingIds.has(item.subjectId));
    const items = event.append ? [...state.history.items, ...appendedItems] : event.history.items;
    return Object.freeze({
      ...state,
      history: freezeHistory(items, 'READY', event.history.nextCursor),
    });
  }

  if (event.type === 'HISTORY_PAGE_FAILED') {
    return Object.freeze({
      ...state,
      history: freezeHistory(state.history.items, 'FAILED', state.history.nextCursor, event.code),
    });
  }

  if (event.type === 'ACCEPT_STARTED' || event.type === 'SAVE_STARTED') {
    return Object.freeze({
      ...state,
      saveState: 'SAVING',
      pendingAction: event.type === 'ACCEPT_STARTED' ? 'ACCEPT_PROPOSAL' : 'SAVE',
      conflict: undefined,
      lastErrorCode: undefined,
    });
  }

  if (event.type === 'AUTHORIZED_VIEW_RELOADED') {
    const view = freezeView(event.view);
    return Object.freeze({
      ...state,
      currentDraft: view,
      lastAuthorizedView: view,
      ...(event.layout === undefined ? {} : { lastAuthorizedLayout: freezeLayout(event.layout) }),
      optimisticLayout: undefined,
      saveState: 'IDLE',
      pendingAction: undefined,
      conflict: undefined,
      lastErrorCode: undefined,
    });
  }

  if (event.type === 'SAVE_SUCCEEDED') {
    const view = freezeView({
      dashboardId: state.currentDraft.dashboardId,
      versionId: event.versionId,
      revision: event.revision,
    });
    return Object.freeze({
      ...state,
      currentDraft: view,
      lastAuthorizedView: view,
      ...(state.optimisticLayout === undefined
        ? {}
        : { lastAuthorizedLayout: state.optimisticLayout }),
      optimisticLayout: undefined,
      saveState: 'SAVED',
      pendingAction: undefined,
      conflict: undefined,
      lastErrorCode: undefined,
      ...(state.pendingAction === 'ACCEPT_PROPOSAL'
        ? { activeProposal: undefined, selectedOptionIds: Object.freeze([]) }
        : {}),
    });
  }

  if (event.type === 'SAVE_FAILED') {
    return Object.freeze({
      ...state,
      optimisticLayout: undefined,
      saveState: 'FAILED',
      pendingAction: undefined,
      conflict: undefined,
      lastErrorCode: event.code,
    });
  }

  if (event.type === 'CONFLICT') {
    return Object.freeze({
      ...state,
      optimisticLayout: undefined,
      saveState: 'CONFLICT',
      pendingAction: undefined,
      conflict: Object.freeze({ serverVersionId: event.serverVersionId }),
      lastErrorCode: undefined,
    });
  }

  if (event.type === 'UNDO_AVAILABLE') {
    return Object.freeze({
      ...state,
      undoTarget: Object.freeze({
        capability: 'VERSION_RESTORE_UNSUPPORTED' as const,
        priorVersionId: event.versionId,
      }),
    });
  }

  return Object.freeze({
    ...state,
    undoTarget: Object.freeze({
      capability: 'WIDGET_RESTORE' as const,
      priorVersionId: event.priorVersionId,
      widgetId: event.widgetId,
    }),
  });
}
