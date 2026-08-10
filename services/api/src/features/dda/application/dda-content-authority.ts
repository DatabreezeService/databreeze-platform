import {
  authorizeUntrustedContentV1,
  brandUntrustedSourceContentV1,
  type DdaContentBoundaryV1,
  type DdaPolicyResultV1,
  type UntrustedSourceContentV1,
} from '@databreeze/domain/data-to-dashboard/policy-v1';

/** DDA-043: brands source-originated strings as data-only and rejects command boundaries. */
export class DdaContentAuthorityV1 {
  public brandSourceContent(input: unknown): DdaPolicyResultV1<UntrustedSourceContentV1> {
    const branded = brandUntrustedSourceContentV1(input);
    if (!branded) {
      return Object.freeze({ accepted: false, code: 'UNTRUSTED_CONTENT_REJECTED' as const });
    }
    return Object.freeze({ accepted: true, value: branded });
  }

  public authorizeAtBoundary(
    content: UntrustedSourceContentV1,
    boundary: DdaContentBoundaryV1,
  ): DdaPolicyResultV1<{ readonly treatedAsDataOnly: true }> {
    return authorizeUntrustedContentV1(content, boundary);
  }
}
