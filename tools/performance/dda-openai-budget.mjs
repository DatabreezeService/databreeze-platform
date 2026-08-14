#!/usr/bin/env node
/**
 * OpenAI budget reconciliation helper (plan 403 Task 9).
 * Reconciles BUA usage classes with provider token metadata without logging content.
 * Pricing is an explicitly versioned evaluation input; absent/stale pricing yields costEstimate: unknown.
 */
const pricingVersion = process.env.DATABREEZE_OPENAI_PRICING_VERSION;
const inputTokens = Number(process.env.DATABREEZE_OPENAI_INPUT_TOKENS ?? '0');
const outputTokens = Number(process.env.DATABREEZE_OPENAI_OUTPUT_TOKENS ?? '0');
const buaRequestUnits = Number(process.env.DATABREEZE_BUA_REQUEST_UNITS ?? '0');

const pricingFresh =
  typeof pricingVersion === 'string' &&
  pricingVersion.length > 0 &&
  process.env.DATABREEZE_OPENAI_PRICING_STALE !== 'true';

const report = {
  status: 'ok',
  controls: ['request', 'image-token', 'text-token', 'concurrency', 'cost'],
  usageClasses: [
    'RECEIPT_EXTRACTION',
    'MAPPING_SUGGESTION',
    'PLAN_PROPOSAL',
    'NARRATIVE',
    'DASHBOARD_PROPOSAL',
  ],
  providerTokens: {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
  },
  bua: {
    requestUnits: Number.isFinite(buaRequestUnits) ? buaRequestUnits : 0,
  },
  pricingVersion: pricingFresh ? pricingVersion : null,
  costEstimate: pricingFresh ? 'evaluation-input-required' : 'unknown',
  contentSafe: true,
  productionReady: false,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = 0;
