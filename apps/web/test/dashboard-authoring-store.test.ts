import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardAuthoringCommandQueueV1,
  type DashboardAuthoringQueuedCommandV1,
  type DashboardAuthoringViewV1,
  DashboardAuthoringLayoutAutosaveV1,
} from '../src/features/dashboards/dashboard-authoring-store.ts';

describe('dashboard authoring layout autosave [DDA-020, DDA-022, DDA-030]', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces layout changes and saves only the final bounded layout after 600 ms', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const autosave = new DashboardAuthoringLayoutAutosaveV1(save);

    autosave.schedule({
      breakpoint: 'desktop',
      cells: [
        {
          widgetId: '00000000-0000-4000-8000-000000000010',
          x: 0,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });
    autosave.schedule({
      breakpoint: 'desktop',
      cells: [
        {
          widgetId: '00000000-0000-4000-8000-000000000010',
          x: 6,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });

    vi.advanceTimersByTime(599);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      breakpoint: 'desktop',
      cells: [
        {
          widgetId: '00000000-0000-4000-8000-000000000010',
          x: 6,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });

    autosave.dispose();
  });

  it('serializes saves and keeps only the newest layout while a save is in flight', async () => {
    vi.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const autosave = new DashboardAuthoringLayoutAutosaveV1(save);
    const layout = (x: number) => ({
      breakpoint: 'desktop' as const,
      cells: [
        {
          widgetId: '00000000-0000-4000-8000-000000000010',
          x,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });

    autosave.schedule(layout(0));
    await vi.advanceTimersByTimeAsync(600);
    autosave.schedule(layout(3));
    autosave.schedule(layout(6));
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(layout(6));
    autosave.dispose();
  });

  it('serializes layout, remove, restore, and proposal commands with advancing revisions', async () => {
    vi.useFakeTimers();
    let releaseFirst: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let activeSaves = 0;
    let maximumActiveSaves = 0;
    const save = vi.fn(
      async (command: DashboardAuthoringQueuedCommandV1, view: DashboardAuthoringViewV1) => {
        activeSaves += 1;
        maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
        if (save.mock.calls.length === 1) await firstSave;
        activeSaves -= 1;
        return {
          commandId: '00000000-0000-4000-8000-000000000009',
          dashboardId: view.dashboardId,
          versionId: `00000000-0000-4000-8000-0000000000${10 + save.mock.calls.length}`,
          revision: view.revision + 1,
          savedAt: '2026-08-12T00:00:00.000Z',
          publishes: false as const,
        };
      },
    );
    const queue = new DashboardAuthoringCommandQueueV1({
      initialView: {
        dashboardId: '00000000-0000-4000-8000-000000000001',
        versionId: '00000000-0000-4000-8000-000000000002',
        revision: 7,
      },
      save,
    });
    const layout = (x: number) => ({
      breakpoint: 'desktop' as const,
      cells: [
        {
          widgetId: '00000000-0000-4000-8000-000000000010',
          x,
          y: 0,
          w: 6,
          h: 4,
        },
      ],
    });

    queue.scheduleLayout(layout(0));
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);

    const remove = queue.enqueue({
      kind: 'REMOVE_WIDGET',
      widgetId: '00000000-0000-4000-8000-000000000010',
    });
    queue.scheduleLayout(layout(3));
    queue.scheduleLayout(layout(6));
    const restore = queue.enqueue({
      kind: 'RESTORE_WIDGET',
      widgetId: '00000000-0000-4000-8000-000000000010',
    });
    const accept = queue.enqueue({
      kind: 'ACCEPT_PROPOSAL',
      proposalId: '00000000-0000-4000-8000-000000000020',
      selectedOptionIds: ['00000000-0000-4000-8000-000000000021'],
    });

    expect(save).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await vi.advanceTimersByTimeAsync(600);
    await remove;
    await restore;
    await accept;

    expect(maximumActiveSaves).toBe(1);
    expect(
      save.mock.calls.map(([command, view]) => [command.kind, view.revision, view.versionId]),
    ).toEqual([
      ['SET_LAYOUT', 7, '00000000-0000-4000-8000-000000000002'],
      ['REMOVE_WIDGET', 8, '00000000-0000-4000-8000-000000000011'],
      ['SET_LAYOUT', 9, '00000000-0000-4000-8000-000000000012'],
      ['RESTORE_WIDGET', 10, '00000000-0000-4000-8000-000000000013'],
      ['ACCEPT_PROPOSAL', 11, '00000000-0000-4000-8000-000000000014'],
    ]);
    expect(save.mock.calls[2]?.[0]).toMatchObject({
      kind: 'SET_LAYOUT',
      layout: layout(6),
    });

    queue.dispose();
  });
});
