import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaIamPrincipalEmailLookupAdapter,
  type IamPrincipalEmailDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-principal-email-lookup.adapter.js';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

const principalId = '00000000-0000-4000-8000-000000000341';

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid principal-email fixture identifier');
  return result.value;
}

function client(row: IamPrincipalEmailDatabaseRowV1 | null) {
  const calls: unknown[] = [];
  return {
    calls,
    userIdentity: {
      findUnique: async ({ where }: { readonly where: Readonly<Record<string, unknown>> }) => {
        calls.push(where);
        return row;
      },
    },
  };
}

void test('[IAM-010] Prisma principal email lookup returns only a normalized active identity', async () => {
  const database = client({ id: principalId, email: 'Invitee@Example.com', status: 'ACTIVE' });
  const adapter = new PrismaIamPrincipalEmailLookupAdapter(database);
  assert.equal(await adapter.findEmail(stable(principalId)), 'invitee@example.com');
  assert.deepEqual(database.calls, [{ id: principalId }]);
});

void test('[IAM-010] Prisma principal email lookup fails closed for inactive or malformed rows', async () => {
  const inactive = new PrismaIamPrincipalEmailLookupAdapter(
    client({ id: principalId, email: 'invitee@example.com', status: 'SUSPENDED' }),
  );
  assert.equal(await inactive.findEmail(stable(principalId)), undefined);
  const malformed = new PrismaIamPrincipalEmailLookupAdapter(
    client({ id: principalId, email: 'not-an-email', status: 'ACTIVE' }),
  );
  assert.equal(await malformed.findEmail(stable(principalId)), undefined);
});

void test('[IAM-010] Prisma principal email lookup does not accept a row for another principal', async () => {
  const adapter = new PrismaIamPrincipalEmailLookupAdapter(
    client({
      id: '00000000-0000-4000-8000-000000000342',
      email: 'invitee@example.com',
      status: 'ACTIVE',
    }),
  );
  assert.equal(await adapter.findEmail(stable(principalId)), undefined);
});
