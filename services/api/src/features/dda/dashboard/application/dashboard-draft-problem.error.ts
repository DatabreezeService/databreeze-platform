export type DashboardDraftProblemCodeV1 =
  | 'DASHBOARD_DRAFT_UNAUTHORIZED'
  | 'DASHBOARD_DRAFT_NOT_FOUND'
  | 'DASHBOARD_DRAFT_UNAVAILABLE';

export class DashboardDraftProblemError extends Error {
  public constructor(readonly code: DashboardDraftProblemCodeV1) {
    super(code);
    this.name = 'DashboardDraftProblemError';
  }
}
