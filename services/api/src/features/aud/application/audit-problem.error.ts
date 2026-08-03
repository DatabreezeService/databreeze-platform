export class AuditProblemError extends Error {
  public constructor(readonly code: 'AUDIT_UNAVAILABLE') {
    super(code);
    this.name = 'AuditProblemError';
  }
}
