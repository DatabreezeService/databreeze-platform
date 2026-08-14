#!/usr/bin/env node
/** Bounded, content-safe staging load probe. It never sends customer data. */
import process from 'node:process';

const DEFAULT_REQUESTS = 20;
const DEFAULT_CONCURRENCY = 4;
const MAX_REQUESTS = 200;
const MAX_CONCURRENCY = 10;

function boundedInteger(raw, fallback, maximum) {
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : undefined;
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function safeTargetOrigin(raw) {
  try {
    const target = new URL(raw);
    if (
      target.protocol !== 'https:' ||
      target.username !== '' ||
      target.password !== '' ||
      target.pathname !== '/' ||
      target.search !== '' ||
      target.hash !== ''
    ) {
      return undefined;
    }
    return target.origin;
  } catch {
    return undefined;
  }
}

async function timedRequest(origin) {
  const startedAt = performance.now();
  const response = await fetch(new URL('/health/ready', origin), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  return { durationMs: performance.now() - startedAt, status: response.status };
}

async function main() {
  const origin = safeTargetOrigin(process.env.DATABREEZE_LOAD_TARGET_ORIGIN);
  if (!origin) {
    console.error('BLOCKED: DATABREEZE_LOAD_TARGET_ORIGIN must be one exact HTTPS staging origin.');
    process.exitCode = 2;
    return;
  }
  const requestCount = boundedInteger(
    process.env.DATABREEZE_LOAD_REQUESTS,
    DEFAULT_REQUESTS,
    MAX_REQUESTS,
  );
  const concurrency = boundedInteger(
    process.env.DATABREEZE_LOAD_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    MAX_CONCURRENCY,
  );
  if (requestCount === undefined || concurrency === undefined || concurrency > requestCount) {
    console.error('INVALID_LOAD_BOUNDS');
    process.exitCode = 2;
    return;
  }

  const results = [];
  let nextRequest = 0;
  async function worker() {
    while (nextRequest < requestCount) {
      nextRequest += 1;
      try {
        results.push(await timedRequest(origin));
      } catch {
        results.push({ durationMs: 5_000, status: 0 });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const latencies = results.map((result) => result.durationMs).sort((left, right) => left - right);
  const successCount = results.filter((result) => result.status === 200).length;
  const report = {
    status: successCount === requestCount ? 'ok' : 'failed',
    profile: 'staging-readiness',
    requestCount,
    concurrency,
    successCount,
    failureCount: requestCount - successCount,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    maxMs: Math.round(latencies.at(-1) ?? 0),
    contentSafe: true,
  };
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'ok' ? 0 : 1;
}

await main();
