import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

export interface IamTenantContextV1 {
  readonly tenantScope: TenantScopeV1;
  readonly actorId: StableIdentifierV1;
  readonly correlationId: StableIdentifierV1;
  readonly idempotencyKey: string;
  readonly authorizationEpoch: number;
  readonly mfaRequired?: boolean;
  readonly mfaReenrollmentRequired?: boolean;
  readonly expectedRevision?: number;
}

export type IamContextErrorCodeV1 =
  | 'INVALID_SCOPE'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TEXT'
  | 'INVALID_EPOCH'
  | 'INVALID_REVISION';

export type IamContextResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IamContextErrorCodeV1 };

function rejected(code: IamContextErrorCodeV1): IamContextResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

export function createIamTenantContextV1(input: {
  readonly tenantScope: unknown;
  readonly actorId: unknown;
  readonly correlationId: unknown;
  readonly idempotencyKey: unknown;
  readonly authorizationEpoch: unknown;
  readonly mfaRequired?: unknown;
  readonly mfaReenrollmentRequired?: unknown;
  readonly expectedRevision?: unknown;
}): IamContextResultV1<IamTenantContextV1> {
  const tenantScope = parseTenantScopeV1(input.tenantScope);
  const actorId = parseStableIdentifierV1(input.actorId);
  const correlationId = parseStableIdentifierV1(input.correlationId);
  if (!tenantScope.accepted) return rejected('INVALID_SCOPE');
  if (!actorId.accepted || !correlationId.accepted) return rejected('INVALID_IDENTIFIER');
  if (
    typeof input.idempotencyKey !== 'string' ||
    input.idempotencyKey.length === 0 ||
    input.idempotencyKey.length > 200 ||
    /\p{Cc}/u.test(input.idempotencyKey)
  )
    return rejected('INVALID_TEXT');
  if (
    typeof input.authorizationEpoch !== 'number' ||
    !Number.isSafeInteger(input.authorizationEpoch) ||
    input.authorizationEpoch < 1
  )
    return rejected('INVALID_EPOCH');
  if (input.mfaRequired !== undefined && typeof input.mfaRequired !== 'boolean')
    return rejected('INVALID_TEXT');
  if (
    input.mfaReenrollmentRequired !== undefined &&
    typeof input.mfaReenrollmentRequired !== 'boolean'
  )
    return rejected('INVALID_TEXT');
  if (
    input.expectedRevision !== undefined &&
    (typeof input.expectedRevision !== 'number' ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1)
  )
    return rejected('INVALID_REVISION');
  return Object.freeze({
    accepted: true,
    value: Object.freeze({
      tenantScope: tenantScope.value,
      actorId: actorId.value,
      correlationId: correlationId.value,
      idempotencyKey: input.idempotencyKey,
      authorizationEpoch: input.authorizationEpoch,
      ...(input.mfaRequired === undefined ? {} : { mfaRequired: input.mfaRequired }),
      ...(input.mfaReenrollmentRequired === undefined
        ? {}
        : { mfaReenrollmentRequired: input.mfaReenrollmentRequired }),
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    }),
  });
}
