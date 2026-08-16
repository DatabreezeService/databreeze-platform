import type { DdaDashboardWidgetResultsAccepted } from '@databreeze/contracts/v4';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const DASHBOARD_WIDGET_RESULT_READER_PORT = Symbol('DASHBOARD_WIDGET_RESULT_READER_PORT');

export type DashboardWidgetResultReadV1 =
  | { readonly accepted: true; readonly value: DdaDashboardWidgetResultsAccepted }
  | { readonly accepted: false; readonly code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'UNAVAILABLE' };

/** Reads one exact immutable snapshot after current server-owned projection authorization. */
export interface DashboardWidgetResultReaderPortV1 {
  read(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId: string;
    readonly snapshotId: string;
    readonly permissionProjectionVersionId: string;
  }): Promise<DashboardWidgetResultReadV1>;
}

export class UnavailableDashboardWidgetResultReaderV1 implements DashboardWidgetResultReaderPortV1 {
  public read(): Promise<DashboardWidgetResultReadV1> {
    return Promise.resolve(Object.freeze({ accepted: false, code: 'UNAVAILABLE' }));
  }
}
