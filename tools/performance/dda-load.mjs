#!/usr/bin/env node
/**
 * DDA load profile scaffold (plan 400 Task 8).
 * Live p95 evidence is blocked without staging + MANUAL-PREREQUISITES §4/§8.
 */
console.log(
  JSON.stringify({
    status: 'blocked',
    reason: 'MANUAL-PREREQUISITES staging deploy and device/browser access required',
    profiles: [
      'cloud-file-intake',
      'dashboard-cached-interaction',
      'on-change-refresh',
      'receipt-upload',
      'analyst-typed-plan',
    ],
    target: { onChangeP95Ms: 60_000 },
  }),
);
process.exitCode = 2;
