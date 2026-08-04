export class AuditProblemError extends Error {
  public constructor(
    readonly code:
      | 'AUDIT_UNAVAILABLE'
      | 'AUDIT_INTEGRITY_INVALID'
      | 'AUDIT_ATTESTATION_NOT_FOUND'
      | 'AUDIT_ATTESTATION_REQUEST_INVALID'
      | 'AUDIT_ATTESTATION_UNAVAILABLE',
  ) {
    super(code);
    this.name = 'AuditProblemError';
  }
}
