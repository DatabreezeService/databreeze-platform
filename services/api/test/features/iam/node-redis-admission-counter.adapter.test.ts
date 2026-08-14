/* eslint-disable @typescript-eslint/require-await -- Redis doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRedisEvalClientAdapter } from '../../../src/features/iam/adapter/node-redis-admission-counter.adapter.js';
import { REDIS_RECOVERY_ADMISSION_INCREMENT_SCRIPT_V1 } from '../../../src/features/iam/adapter/redis-recovery-admission.adapter.js';

void test('[IAM-022] node-redis admission wrapper preserves one atomic script with explicit keys and arguments', async () => {
  const calls: unknown[] = [];
  const adapter = new NodeRedisEvalClientAdapter({
    eval: async (...argumentsList: unknown[]) => {
      calls.push(argumentsList);
      return 2;
    },
  });

  assert.equal(
    await adapter.eval(
      REDIS_RECOVERY_ADMISSION_INCREMENT_SCRIPT_V1,
      ['databreeze:iam:registration:ip:v1:digest'],
      ['900000'],
    ),
    2,
  );
  assert.deepEqual(calls, [
    [
      REDIS_RECOVERY_ADMISSION_INCREMENT_SCRIPT_V1,
      {
        keys: ['databreeze:iam:registration:ip:v1:digest'],
        arguments: ['900000'],
      },
    ],
  ]);
});

void test('[IAM-022] node-redis wrapper rejects ambiguous multi-key or malformed calls before provider access', async () => {
  let calls = 0;
  const adapter = new NodeRedisEvalClientAdapter({
    eval: async () => {
      calls += 1;
      return 1;
    },
  });

  await assert.rejects(adapter.eval('return 1', [], ['1']), /IAM_REDIS_ADMISSION_INPUT_INVALID/);
  await assert.rejects(
    adapter.eval('return 1', ['one', 'two'], ['1']),
    /IAM_REDIS_ADMISSION_INPUT_INVALID/,
  );
  assert.equal(calls, 0);
});
