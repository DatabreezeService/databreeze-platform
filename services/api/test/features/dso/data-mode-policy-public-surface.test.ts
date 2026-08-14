import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestMethod } from '@nestjs/common';

import { DataModePolicyController } from '../../../src/features/dso/api/data-mode-policy.controller.js';

void test('[DSO-018/026/027] public data-mode policy surface is read-only until guarded activation exists', () => {
  const prototype = DataModePolicyController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function') return [];
      const method = Reflect.getMetadata('method', handler) as RequestMethod | undefined;
      if (method === undefined) return [];
      return [
        {
          name,
          method,
          path: Reflect.getMetadata('path', handler) as string | undefined,
        },
      ];
    });

  assert.deepEqual(routes, [{ name: 'list', method: RequestMethod.GET, path: ':policyId' }]);
});
