import type { DdaDashboardAuthoringCommandResult } from '@databreeze/contracts/v3';
import type {
  DashboardAuthoringLayoutV1,
  DashboardAuthoringViewV1,
} from './dashboard-authoring-reducer.ts';

export type { DashboardAuthoringViewV1 } from './dashboard-authoring-reducer.ts';

export const DASHBOARD_LAYOUT_AUTOSAVE_DELAY_MS = 600;

export type DashboardAuthoringLayoutSaveV1 = (
  layout: DashboardAuthoringLayoutV1,
) => void | Promise<void>;

export type DashboardAuthoringQueuedCommandV1 =
  | { readonly kind: 'SET_LAYOUT'; readonly layout: DashboardAuthoringLayoutV1 }
  | { readonly kind: 'REMOVE_WIDGET'; readonly widgetId: string }
  | { readonly kind: 'RESTORE_WIDGET'; readonly widgetId: string }
  | {
      readonly kind: 'ACCEPT_PROPOSAL';
      readonly proposalId: string;
      readonly selectedOptionIds: readonly string[];
    };

export type DashboardAuthoringCommandSaveResultV1 = DdaDashboardAuthoringCommandResult;

export type DashboardAuthoringCommandSaveV1 = (
  command: DashboardAuthoringQueuedCommandV1,
  view: DashboardAuthoringViewV1,
) => Promise<DashboardAuthoringCommandSaveResultV1>;

export interface DashboardAuthoringCommandQueueOptionsV1 {
  readonly initialView: DashboardAuthoringViewV1;
  readonly onCommandFailed?: (
    command: DashboardAuthoringQueuedCommandV1,
    error: unknown,
    view: DashboardAuthoringViewV1,
  ) => void;
  readonly onCommandStarted?: (
    command: DashboardAuthoringQueuedCommandV1,
    view: DashboardAuthoringViewV1,
  ) => void;
  readonly onCommandSucceeded?: (
    command: DashboardAuthoringQueuedCommandV1,
    result: DashboardAuthoringCommandSaveResultV1,
  ) => void;
  readonly save: DashboardAuthoringCommandSaveV1;
}

function cloneLayout(layout: DashboardAuthoringLayoutV1): DashboardAuthoringLayoutV1 {
  return Object.freeze({
    breakpoint: layout.breakpoint,
    cells: Object.freeze(layout.cells.map((cell) => Object.freeze({ ...cell }))),
  });
}

function cloneView(view: DashboardAuthoringViewV1): DashboardAuthoringViewV1 {
  return Object.freeze({ ...view });
}

interface QueuedCommandV1 {
  readonly command: DashboardAuthoringQueuedCommandV1;
  readonly order: number;
  readonly reject: (error: unknown) => void;
  readonly resolve: (result: DashboardAuthoringCommandSaveResultV1) => void;
}

interface PendingLayoutV1 {
  readonly order: number;
  layout: DashboardAuthoringLayoutV1;
}

/**
 * DDA-020/DDA-022/DDA-030/WEB-016: one revision-aware queue owns every
 * dashboard authoring command. Layout edits debounce, while effectful
 * commands retain their order and always receive the result of the prior save.
 */
export class DashboardAuthoringCommandQueueV1 {
  private currentView: DashboardAuthoringViewV1;
  private disposed = false;
  private nextOrder = 0;
  private paused = false;
  private pendingLayout: PendingLayoutV1 | undefined;
  private processing = false;
  private readonly queue: QueuedCommandV1[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly options: DashboardAuthoringCommandQueueOptionsV1) {
    this.currentView = cloneView(options.initialView);
  }

  public getCurrentView(): DashboardAuthoringViewV1 {
    return this.currentView;
  }

  public scheduleLayout(layout: DashboardAuthoringLayoutV1): void {
    if (this.disposed || this.paused) return;
    if (this.pendingLayout === undefined) {
      this.pendingLayout = {
        order: ++this.nextOrder,
        layout: cloneLayout(layout),
      };
    } else {
      this.pendingLayout.layout = cloneLayout(layout);
    }
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flushPendingLayout();
    }, DASHBOARD_LAYOUT_AUTOSAVE_DELAY_MS);
  }

  public enqueue(
    command: DashboardAuthoringQueuedCommandV1,
  ): Promise<DashboardAuthoringCommandSaveResultV1> {
    if (this.disposed) return Promise.reject(new Error('DASHBOARD_AUTHORING_QUEUE_DISPOSED'));
    if (this.paused) return Promise.reject(new Error('DASHBOARD_AUTHORING_QUEUE_PAUSED'));

    const order = ++this.nextOrder;
    return new Promise((resolve, reject) => {
      this.queue.push({ command, order, reject, resolve });
      this.queue.sort((left, right) => left.order - right.order);
      void this.drain();
    });
  }

  /** Stop after a failed precondition until the caller has loaded an authorized view. */
  public reset(view: DashboardAuthoringViewV1): void {
    if (this.disposed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingLayout = undefined;
    const resetError = new Error('DASHBOARD_AUTHORING_QUEUE_RESET');
    for (const entry of this.queue.splice(0)) entry.reject(resetError);
    this.currentView = cloneView(view);
    this.paused = false;
    void this.drain();
  }

  private flushPendingLayout(): void {
    const pendingLayout = this.pendingLayout;
    if (pendingLayout === undefined || this.disposed || this.paused) return;
    this.pendingLayout = undefined;
    this.queue.push({
      command: { kind: 'SET_LAYOUT', layout: pendingLayout.layout },
      order: pendingLayout.order,
      reject: () => undefined,
      resolve: () => undefined,
    });
    this.queue.sort((left, right) => left.order - right.order);
    void this.drain();
  }

  private rejectQueued(error: unknown): void {
    for (const entry of this.queue.splice(0)) entry.reject(error);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingLayout = undefined;
  }

  private async drain(): Promise<void> {
    if (this.disposed || this.paused || this.processing) return;
    const next = this.queue[0];
    if (next === undefined) return;
    if (this.pendingLayout !== undefined && this.pendingLayout.order < next.order) return;

    this.processing = true;
    this.queue.shift();
    const view = this.currentView;
    this.options.onCommandStarted?.(next.command, view);
    try {
      const result = await this.options.save(next.command, view);
      this.currentView = cloneView({
        dashboardId: result.dashboardId,
        versionId: result.versionId,
        revision: result.revision,
      });
      this.options.onCommandSucceeded?.(next.command, result);
      next.resolve(result);
    } catch (error) {
      this.paused = true;
      this.rejectQueued(error);
      this.options.onCommandFailed?.(next.command, error, view);
      next.reject(error);
    } finally {
      this.processing = false;
      if (!this.paused) void this.drain();
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingLayout = undefined;
    const disposeError = new Error('DASHBOARD_AUTHORING_QUEUE_DISPOSED');
    for (const entry of this.queue.splice(0)) entry.reject(disposeError);
  }
}

/** DDA-030: coalesce local layout events; the caller sends the resulting idempotent immutable command. */
export class DashboardAuthoringLayoutAutosaveV1 {
  private pendingLayout: DashboardAuthoringLayoutV1 | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving = false;
  private disposed = false;

  public constructor(private readonly save: DashboardAuthoringLayoutSaveV1) {}

  public schedule(layout: DashboardAuthoringLayoutV1): void {
    if (this.disposed) return;
    this.pendingLayout = cloneLayout(layout);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, DASHBOARD_LAYOUT_AUTOSAVE_DELAY_MS);
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.saving) return;
    const pendingLayout = this.pendingLayout;
    if (pendingLayout === undefined) return;
    this.pendingLayout = undefined;
    this.saving = true;
    try {
      await this.save(pendingLayout);
    } catch {
      // The caller owns visible failure state; the queue must remain usable for the next layout.
    } finally {
      this.saving = false;
      if (!this.disposed && this.pendingLayout !== undefined) void this.flush();
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingLayout = undefined;
  }
}
