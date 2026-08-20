import { createHash } from 'node:crypto';

import type { LandingFeedbackAdmissionDigestPortV1 } from '../application/landing-feedback-intake.port.js';

/** Deterministic digest for local/dev admission; production composes an HMAC adapter. */
export class Sha256LandingFeedbackAdmissionDigestAdapter
  implements LandingFeedbackAdmissionDigestPortV1
{
  public digestCandidates(kind: 'ip', value: string): readonly string[] {
    return [createHash('sha256').update(`lfb:${kind}:${value}`, 'utf8').digest('hex')];
  }
}
