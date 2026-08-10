import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const stateDir = resolve(root, '.demo-state/dda');

rmSync(stateDir, { recursive: true, force: true });
mkdirSync(stateDir, { recursive: true });

const state = {
  resetAt: new Date().toISOString(),
  prototype: true,
  productionReady: false,
  fixtures: {
    messySales: 'tools/fixture-validation/fixtures/dda/messy-sales',
    receiptExpense: 'tools/fixture-validation/fixtures/dda/receipt-expense',
  },
  expected: {
    messySalesRowCount: 4,
    messySalesRejectedCount: 1,
    receiptCurrency: 'VND',
    receiptTotalMinorUnits: 125000,
  },
  knownLimitations: [
    '083: Playwright CSP unsafe-eval may block chart paths; web partly fixture-backed',
    '084: in-memory refresh; synthetic perf; in-process SSE',
    '085: DSO stub; no long-running FS watcher; folder UI not in shell nav',
    '086: shutter prototype; in-memory staging; fake OCR; emulator optional',
    'DDA processors are not yet registered in the closed engine ActionRegistry',
  ],
};

writeFileSync(resolve(stateDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, stateDir: '.demo-state/dda' })}\n`);
