import assert from 'node:assert/strict';
import test from 'node:test';

import { UnavailableWorkerObjectGrantAuthority } from '../../../../src/features/jra/worker/unavailable-worker-object-grant-authority.js';

void test('keeps worker object grants fail-closed until IAE exposes signed capabilities', async () => {
  const authority = new UnavailableWorkerObjectGrantAuthority();
  await assert.rejects(
    authority.issueInputGrant({} as never, {} as never, {} as never),
    /IAE_WORKER_OBJECT_GRANT_CAPABILITY_UNAVAILABLE/,
  );
  await assert.rejects(
    authority.acceptResultReferences({} as never, {} as never, {} as never, []),
    /IAE_WORKER_OBJECT_GRANT_CAPABILITY_UNAVAILABLE/,
  );
});
