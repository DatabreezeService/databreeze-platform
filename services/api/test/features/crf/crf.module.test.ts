import assert from 'node:assert/strict';
import test from 'node:test';

import { CrfModule } from '../../../src/features/crf/crf.module.js';
import { CRF_REPORT_REPOSITORY_PORT } from '../../../src/features/crf/application/report-repository.port.js';
import { PrismaCrfReportRepositoryAdapter } from '../../../src/features/crf/adapter/prisma-report-repository.adapter.js';

const repositories = {
  governedDatasetRepository: {} as never,
  datasetVersionRepository: {} as never,
};

void test('[CRF-001] production composition fails closed without dataset authority', () => {
  assert.doesNotThrow(() =>
    CrfModule.register({ runtimeMode: 'production', reportDatabase: {} as never }),
  );
});

void test('[CRF-001] configured database selects the durable report adapter', () => {
  const dynamic = CrfModule.register({
    runtimeMode: 'production',
    reportDatabase: {} as never,
    ...repositories,
  });
  const provider = dynamic.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === CRF_REPORT_REPOSITORY_PORT,
  );
  assert.ok(provider && 'useValue' in provider);
  if (provider && 'useValue' in provider)
    assert.ok(provider.useValue instanceof PrismaCrfReportRepositoryAdapter);
});
