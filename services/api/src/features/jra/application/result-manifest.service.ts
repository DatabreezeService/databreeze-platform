import {
  createResultManifestV1,
  type ResultManifestResultV1,
  type ResultManifestV1,
} from '@databreeze/domain/result-manifest/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ResultManifestRepositoryPortV1 } from './result-manifest-repository.port.js';

function rejected<TValue>(code: 'INVALID_IDENTIFIER'): ResultManifestResultV1<TValue> {
  return Object.freeze({ accepted: false, code });
}

/** Publishes one immutable result manifest for one execution attempt. */
export class ResultManifestService {
  public constructor(private readonly repository: ResultManifestRepositoryPortV1) {}

  public async publish(
    context: IamTenantContextV1,
    input: Parameters<typeof createResultManifestV1>[0],
  ): Promise<ResultManifestResultV1<ResultManifestV1>> {
    const created = createResultManifestV1(input);
    if (!created.accepted) return created;
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.findByAttempt(context, created.value.attemptId);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(created.value)
          ? Object.freeze({ accepted: true, value: existing })
          : rejected('INVALID_IDENTIFIER');
      }
      await transaction.save(context, created.value);
      return created;
    });
  }

  public find(
    context: IamTenantContextV1,
    resultManifestId: StableIdentifierV1,
  ): Promise<ResultManifestV1 | undefined> {
    return this.repository.find(context, resultManifestId);
  }
}
