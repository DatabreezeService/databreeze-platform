import { createHash } from 'node:crypto';

import type { AuditDigestPortV1 } from '@databreeze/domain/audit/v1';

/** Deterministic digest implementation for the control-plane audit chain. */
export class Sha256AuditDigestAdapter implements AuditDigestPortV1 {
  public digest(canonicalRecord: string): string {
    return createHash('sha256').update(canonicalRecord, 'utf8').digest('base64url');
  }
}
