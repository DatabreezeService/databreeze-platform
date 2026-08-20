import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ProfileLocaleV1,
  ProfileMutationPortV1,
  ProfileMutationResultV1,
} from './profile-mutation.port.js';

export class ProfileMutationService {
  public constructor(private readonly port: ProfileMutationPortV1) {}

  public update(input: {
    readonly actorId: unknown;
    readonly displayName: unknown;
    readonly locale: unknown;
    readonly expectedRevision: unknown;
    readonly idempotencyKey: unknown;
  }): Promise<ProfileMutationResultV1> {
    const actor = parseStableIdentifierV1(input.actorId);
    const displayName =
      typeof input.displayName === 'string' ? input.displayName.normalize('NFC').trim() : '';
    const locale = input.locale;
    const expectedRevision = input.expectedRevision;
    const idempotencyKey =
      typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (
      !actor.accepted ||
      displayName.length < 1 ||
      displayName.length > 200 ||
      /\p{Cc}/u.test(displayName) ||
      (locale !== 'vi-VN' && locale !== 'en') ||
      typeof expectedRevision !== 'number' ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 1 ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200 ||
      /\p{Cc}/u.test(idempotencyKey)
    ) {
      return Promise.resolve({ accepted: false, code: 'INVALID_INPUT' });
    }
    return this.port.update({
      actorId: actor.value,
      displayName,
      locale: locale as ProfileLocaleV1,
      expectedRevision,
      idempotencyKey,
    });
  }
}
