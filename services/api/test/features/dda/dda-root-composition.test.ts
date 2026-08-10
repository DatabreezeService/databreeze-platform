import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

void test('[DDA-038] AppModule composes DdaModule for intake ETL analyst dashboard refresh receipt', () => {
  const appModule = readFileSync(resolve(root, 'src/app.module.ts'), 'utf8');
  assert.match(appModule, /DdaModule\.register/u);
  assert.match(appModule, /from ['"]\.\/features\/dda\/dda\.module\.js['"]/u);
  assert.match(appModule, /DdaModuleOptions/u);
});

void test('[DDA-038] DdaModule registers leaf HTTP controllers for mentor-demo surfaces', () => {
  const moduleSource = readFileSync(resolve(root, 'src/features/dda/dda.module.ts'), 'utf8');
  for (const required of [
    'WebIntakeController',
    'EtlProposalController',
    'EtlAcceptanceController',
    'AnalysisControllerV1',
    'DashboardDraftControllerV1',
    'DashboardPublicationControllerV1',
    'DashboardQueryControllerV1',
    'DashboardRefreshController',
    'DashboardRefreshEventsController',
    'ReceiptExtractionController',
  ]) {
    assert.match(
      moduleSource,
      new RegExp(`\\b${required}\\b`, 'u'),
      `missing controller ${required}`,
    );
  }
  assert.match(moduleSource, /controllers:\s*\[/u);
});
