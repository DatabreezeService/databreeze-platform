import assert from 'node:assert/strict';
import test from 'node:test';

import type { DdaDatabaseClientV1 } from '../../../src/features/dda/adapter/dda-database.client.js';
import { DdaModule } from '../../../src/features/dda/dda.module.js';
import {
  RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT,
  UnavailableReceiptExtractionCommandRepositoryAdapter,
} from '../../../src/features/dda/receipt/application/receipt-extraction-command.port.js';
import { PrismaReceiptExtractionCommandRepositoryAdapter } from '../../../src/features/dda/receipt/adapter/prisma-receipt-extraction-command-repository.adapter.js';

function providerValue(module: ReturnType<typeof DdaModule.register>, token: unknown): unknown {
  const providers = (module.providers ?? []) as readonly {
    readonly provide?: unknown;
    readonly useValue?: unknown;
  }[];
  return providers.find((provider) => provider.provide === token)?.useValue;
}

void test('[DDA-041] database-backed production composition selects the durable receipt command adapter', () => {
  const module = DdaModule.register({
    runtimeMode: 'production',
    ddaDatabase: {} as DdaDatabaseClientV1,
  });

  assert.ok(
    providerValue(module, RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT) instanceof
      PrismaReceiptExtractionCommandRepositoryAdapter,
  );
});

void test('[DDA-041] test composition keeps receipt command replay unavailable without a database', () => {
  for (const runtimeMode of ['test', 'development'] as const) {
    const module = DdaModule.register({
      runtimeMode,
      allowInMemoryAdapters: true,
    });

    assert.ok(
      providerValue(module, RECEIPT_EXTRACTION_COMMAND_REPOSITORY_PORT) instanceof
        UnavailableReceiptExtractionCommandRepositoryAdapter,
      runtimeMode,
    );
  }
});
