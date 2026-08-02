import {
  createInboxItemV1,
  finalizeArtifactAdmissionV1,
  transitionInboxItemV1,
  type ArtifactIntakeResultV1,
  type ArtifactScanStateV1,
  type InboxItemV1,
} from '@databreeze/domain/artifact-intake/v1';
import type { ArtifactVersionV1 } from '@databreeze/domain/artifact/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactIntakeRepositoryPortV1 } from './artifact-intake-repository.port.js';

export type ArtifactIntakeServiceErrorV1 =
  | 'IDEMPOTENCY_CONFLICT'
  | 'INBOX_NOT_FOUND'
  | 'INVALID_TRANSITION';

export type ArtifactIntakeServiceResultV1<TValue> =
  | ArtifactIntakeResultV1<TValue>
  | { readonly accepted: false; readonly code: ArtifactIntakeServiceErrorV1 };

/** Coordinates IAE inbox identity, deterministic admission, and state transitions. */
export class ArtifactIntakeService {
  public constructor(private readonly repository: ArtifactIntakeRepositoryPortV1) {}

  public async create(
    context: IamTenantContextV1,
    input: Parameters<typeof createInboxItemV1>[0],
  ): Promise<ArtifactIntakeServiceResultV1<InboxItemV1>> {
    const created = createInboxItemV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findByIdempotency(context, created.value.idempotencyKey);
      if (existing) {
        if (
          existing.artifactVersionId !== created.value.artifactVersionId ||
          JSON.stringify(existing.tenantScope) !== JSON.stringify(created.value.tenantScope)
        )
          return Object.freeze({ accepted: false, code: 'IDEMPOTENCY_CONFLICT' as const });
        return Object.freeze({ accepted: true, value: existing });
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public async admit(
    context: IamTenantContextV1,
    inboxItemId: InboxItemV1['inboxItemId'],
    artifact: ArtifactVersionV1,
    input: Omit<Parameters<typeof finalizeArtifactAdmissionV1>[0], 'artifact'>,
  ): Promise<
    ArtifactIntakeServiceResultV1<{
      item: InboxItemV1;
      status: 'ACTIVE' | 'QUARANTINED';
      scanState: ArtifactScanStateV1;
    }>
  > {
    return this.repository.withTransaction(context, async (transaction) => {
      const item = await transaction.find(context, inboxItemId);
      if (!item) return Object.freeze({ accepted: false, code: 'INBOX_NOT_FOUND' as const });
      const admission = finalizeArtifactAdmissionV1({ artifact, ...input });
      if (!admission.accepted) return admission;
      const next = transitionInboxItemV1(
        item,
        admission.value.status === 'ACTIVE' ? 'ROUTED' : 'QUARANTINED',
      );
      if (!next.accepted)
        return Object.freeze({ accepted: false, code: 'INVALID_TRANSITION' as const });
      await transaction.save(context, next.value);
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ item: next.value, ...admission.value }),
      });
    });
  }

  public async list(context: IamTenantContextV1): Promise<readonly InboxItemV1[]> {
    return this.repository.withTransaction(context, (transaction) => transaction.list(context));
  }
}
