import { defineConfig } from 'prisma/config';

const offlineValidationUrl =
  'postgresql://offline_validation:invalid@127.0.0.1:1/databreeze?connect_timeout=1';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] || offlineValidationUrl },
});
