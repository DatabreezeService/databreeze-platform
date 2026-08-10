#!/usr/bin/env node
/**
 * OpenAI budget reconciliation scaffold (plan 400 Task 8).
 * Blocked without MANUAL-PREREQUISITES §3 spend limits and §8 budgets.
 */
console.log(
  JSON.stringify({
    status: 'blocked',
    reason: 'OpenAI project spend limits and BUA metering reconciliation require owner credentials',
    secretName: 'databreeze/{env}/openai/receipt-ocr',
    controls: ['request', 'image-token', 'text-token', 'concurrency', 'cost'],
  }),
);
process.exitCode = 2;
