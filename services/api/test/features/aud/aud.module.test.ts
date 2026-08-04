import assert from 'node:assert/strict';
import test from 'node:test';

import { AudModule } from '../../../src/features/aud/aud.module.js';
import { AUDIT_ATTESTATION_REPOSITORY_PORT } from '../../../src/features/aud/application/audit-attestation-repository.port.js';
import { AUDIT_ATTESTATION_SERVICE } from '../../../src/features/aud/application/audit-attestation.service.js';
import { AUDIT_LEDGER_SERVICE } from '../../../src/features/aud/aud.module.js';

void test('[AUD-015, AUD-016] module composition keeps attestations behind replaceable ports', () => {
  const dynamic = AudModule.register({
    auditAttestationSigner: {
      sign: (payload) => payload,
      verify: (payload, signature) => payload === signature,
    },
  });
  assert.equal(
    dynamic.providers?.some(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === AUDIT_ATTESTATION_REPOSITORY_PORT,
    ),
    true,
  );
  assert.equal(
    dynamic.providers?.some(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === AUDIT_ATTESTATION_SERVICE,
    ),
    true,
  );
  assert.equal(dynamic.exports?.includes(AUDIT_LEDGER_SERVICE), true);
});
