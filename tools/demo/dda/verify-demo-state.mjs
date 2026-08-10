import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const statePath = resolve(root, '.demo-state/dda/state.json');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!existsSync(statePath)) {
  fail('Demo state missing. Run tools/demo/dda/reset-demo-state.mjs first.');
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (state.productionReady !== false) fail('Demo state must keep productionReady=false');
  if (state.prototype !== true) fail('Demo state must remain a prototype claim');

  const parity = spawnSync(process.execPath, [resolve(root, 'tools/fixture-validation/src/run-dda-parity.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      UV_NO_CACHE: process.env.UV_NO_CACHE ?? '1',
    },
  });
  if (parity.status !== 0) {
    fail(`Parity verification failed:\n${parity.stdout}\n${parity.stderr}`);
  } else {
    const summary = JSON.parse(parity.stdout);
    if (summary.rowCount !== state.expected.messySalesRowCount) {
      fail(`Unexpected rowCount ${summary.rowCount}`);
    } else if (summary.rejectedCount !== state.expected.messySalesRejectedCount) {
      fail(`Unexpected rejectedCount ${summary.rejectedCount}`);
    } else {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          productionReady: false,
          parity: summary,
          limitations: state.knownLimitations,
        })}\n`,
      );
    }
  }
}
