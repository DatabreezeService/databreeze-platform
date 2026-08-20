import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  applyPlatformAdminRowsToConfiguredLocalDatabase,
  readConfiguredLocalPlatformAdminMetrics,
} from './seed-local.mjs';

export async function runPlatformAdminLocalSeed({
  apply = applyPlatformAdminRowsToConfiguredLocalDatabase,
  readMetrics = readConfiguredLocalPlatformAdminMetrics,
  log = console.log,
} = {}) {
  const summary = await apply();
  const actual = await readMetrics();

  log('Platform-admin local fixture applied with bounded upserts.');
  log(
    `Rows: ${summary.organizations} organizations, ${summary.users} users, ${summary.memberships} memberships, ${summary.paymentOrders} payment orders, ${summary.subscriptions} subscriptions, ${summary.invoices} invoices, ${summary.feedbacks} feedbacks.`,
  );
  log(
    `Authoritative overview rows: ${actual.totalUsers} total users, ${actual.paidUsers} paid users, ${actual.activeSubscriptions} active subscriptions, ${actual.settledRevenueVnd.toLocaleString('en-US')} VND paid revenue, ${actual.feedbacks} feedbacks.`,
  );

  return Object.freeze({ seeded: summary, actual });
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runPlatformAdminLocalSeed().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
