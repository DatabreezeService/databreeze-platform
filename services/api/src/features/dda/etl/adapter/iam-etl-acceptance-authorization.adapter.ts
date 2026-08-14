import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';

import type {
  EtlAcceptanceAuthorizationInputV1,
  EtlAcceptanceAuthorizationPortV1,
  EtlAcceptanceAuthorizationResultV1,
} from '../application/etl-acceptance-authorization.port.js';
import {
  authorizeIamDdaMutationV1,
  parseExactStableIdentifierV1,
  type IamDdaMutationAuthorizationSourceV1,
} from '../../adapter/iam-dda-mutation-authorization.source.js';

function unavailable(): EtlAcceptanceAuthorizationResultV1 {
  return { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

/** Maps ETL acceptance to both canonical job execution permissions. */
export class IamEtlAcceptanceAuthorizationAdapter implements EtlAcceptanceAuthorizationPortV1 {
  public constructor(private readonly source: IamDdaMutationAuthorizationSourceV1) {}

  public async authorize(
    input: EtlAcceptanceAuthorizationInputV1,
  ): Promise<EtlAcceptanceAuthorizationResultV1> {
    if (!isRecord(input) || input['action'] !== 'ETL_ACCEPT') return unavailable();
    if (parseExactStableIdentifierV1(input['proposalId']) === undefined) return unavailable();

    const createDecision = await authorizeIamDdaMutationV1(
      this.source,
      input['context'],
      PERMISSIONS_V1.JOB_EXECUTION_CREATE,
      [input['proposalId']],
    );
    if (!createDecision.accepted) return createDecision;

    const runDecision = await authorizeIamDdaMutationV1(
      this.source,
      input['context'],
      PERMISSIONS_V1.JOB_EXECUTION_RUN,
      [input['proposalId']],
    );
    if (!runDecision.accepted) return runDecision;
    return { accepted: true };
  }
}
