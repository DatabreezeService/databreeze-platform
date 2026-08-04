import { createHmac } from 'node:crypto';

import type {
  RegistrationAdmissionDigestKeyV1,
  RegistrationAdmissionDigestPortV1,
} from '../application/registration-repository.port.js';

function validKey(key: RegistrationAdmissionDigestKeyV1): boolean {
  return (
    (typeof key === 'string' && Buffer.byteLength(key, 'utf8') >= 32) ||
    (key instanceof Uint8Array && key.byteLength >= 32)
  );
}

function boundedInput(value: string): string {
  if (value.length === 0 || value.length > 4096 || /\p{Cc}/u.test(value))
    throw new Error('IAM_REGISTRATION_ADMISSION_INPUT_INVALID');
  return value.normalize('NFC');
}

/** Keyed, versioned admission identifiers; previous keys permit bounded rotation overlap. */
export class HmacSha256IamRegistrationAdmissionDigestAdapter
  implements RegistrationAdmissionDigestPortV1
{
  private readonly keys: readonly RegistrationAdmissionDigestKeyV1[];

  public constructor(
    currentKey: RegistrationAdmissionDigestKeyV1,
    previousKeys: readonly RegistrationAdmissionDigestKeyV1[] = [],
  ) {
    if (!validKey(currentKey) || previousKeys.some((key) => !validKey(key)))
      throw new Error('IAM_REGISTRATION_ADMISSION_KEY_INVALID');
    this.keys = Object.freeze([currentKey, ...previousKeys]);
  }

  public digestCandidates(kind: 'ip' | 'email', value: string): readonly string[] {
    const normalized = boundedInput(value);
    return Object.freeze(
      this.keys.map((key) =>
        createHmac('sha256', key)
          .update(`databreeze:iam:registration:${kind}:v1\u0000${normalized}`, 'utf8')
          .digest('hex'),
      ),
    );
  }
}
