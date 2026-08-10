export type DashboardComparisonErrorV1 = 'INCOMPATIBLE_SNAPSHOTS';

export type DashboardComparisonResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardComparisonErrorV1 };

export interface SnapshotCompareSideV1 {
  readonly snapshotId: string;
  readonly dashboardVersionId: string;
  readonly values: Readonly<Record<string, number | null>>;
  readonly widgets: readonly string[];
  readonly inputs: readonly string[];
  readonly schemaFamily?: string;
}

/** DDA-047: compatible snapshot comparison with declared null/zero percentage behavior. */
export class DashboardComparisonServiceV1 {
  public compare(input: {
    readonly left: SnapshotCompareSideV1;
    readonly right: SnapshotCompareSideV1;
  }): DashboardComparisonResultV1<{
    readonly changes: Readonly<
      Record<string, { readonly absolute: number | null; readonly percentage: number | null }>
    >;
    readonly changedWidgets: readonly string[];
    readonly changedInputs: readonly string[];
  }> {
    if (
      input.left.schemaFamily &&
      input.right.schemaFamily &&
      input.left.schemaFamily !== input.right.schemaFamily
    ) {
      return Object.freeze({ accepted: false, code: 'INCOMPATIBLE_SNAPSHOTS' as const });
    }

    const keys = new Set([...Object.keys(input.left.values), ...Object.keys(input.right.values)]);
    const changes: Record<string, { absolute: number | null; percentage: number | null }> = {};
    for (const key of keys) {
      const left = input.left.values[key] ?? null;
      const right = input.right.values[key] ?? null;
      if (left === null || right === null) {
        changes[key] = { absolute: null, percentage: null };
        continue;
      }
      const absolute = right - left;
      const percentage = left === 0 ? null : (absolute / left) * 100;
      changes[key] = { absolute, percentage };
    }

    const changedWidgets = input.right.widgets.filter((id) => !input.left.widgets.includes(id));
    const changedInputs = input.right.inputs.filter((id) => !input.left.inputs.includes(id));
    return Object.freeze({
      accepted: true,
      value: Object.freeze({
        changes: Object.freeze(changes),
        changedWidgets: Object.freeze(changedWidgets),
        changedInputs: Object.freeze(changedInputs),
      }),
    });
  }
}
