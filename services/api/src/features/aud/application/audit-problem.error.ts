export class AuditProblemError extends Error {
  public constructor(readonly code: 'AUDIT_UNAVAILABLE' | 'AUDIT_INTEGRITY_INVALID') {
    super(code);
    this.name = 'AuditProblemError';
  }
}
