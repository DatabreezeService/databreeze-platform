import { createApiApplication } from './bootstrap.js';
import {
  createDatabaseCompositionForRuntime,
  createGracefulShutdownHandler,
  createStartupCleanupHandler,
  productionShutdownDeadlineMs,
  registerProductionShutdownHandlers,
  PRODUCTION_CSRF_ORIGINS_ERROR,
  PRODUCTION_DATABASE_URL_ERROR,
  PRODUCTION_OPENAI_CONFIGURATION_ERROR,
  PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR,
} from './platform/production-database.composition.js';
import {
  LOCAL_DATABASE_URL_ERROR,
  LOCAL_HTTPS_ORIGIN_ERROR,
  LOCAL_IAM_KEY_ERROR,
  LOCAL_MINIO_CONFIGURATION_ERROR,
  LOCAL_PROVIDER_UNAVAILABLE,
  LOCAL_REDIS_URL_ERROR,
  LOCAL_RUNTIME_PROFILE_ERROR,
  LOCAL_SMTP_CONFIGURATION_ERROR,
} from './platform/local-database.composition.js';

function listenPort(): number {
  const value = process.env['PORT'];
  if (value === undefined) return 3000;
  if (!/^\d{1,5}$/.test(value)) throw new Error('PORT must be an integer from 1 through 65535');
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 through 65535');
  return port;
}

function startupErrorMessage(error: unknown): string {
  if (process.env['NODE_ENV'] === 'production') {
    if (
      error instanceof Error &&
      (error.message === PRODUCTION_DATABASE_URL_ERROR ||
        error.message === PRODUCTION_CSRF_ORIGINS_ERROR ||
        error.message === PRODUCTION_OPENAI_CONFIGURATION_ERROR ||
        error.message === PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR ||
        error.message === LOCAL_RUNTIME_PROFILE_ERROR ||
        error.message === LOCAL_DATABASE_URL_ERROR ||
        error.message === LOCAL_REDIS_URL_ERROR ||
        error.message === LOCAL_SMTP_CONFIGURATION_ERROR ||
        error.message === LOCAL_HTTPS_ORIGIN_ERROR ||
        error.message === LOCAL_IAM_KEY_ERROR ||
        error.message === LOCAL_MINIO_CONFIGURATION_ERROR ||
        error.message === LOCAL_PROVIDER_UNAVAILABLE)
    ) {
      return error.message;
    }
    return 'API_STARTUP_FAILED';
  }
  return error instanceof Error ? error.message : 'API_STARTUP_FAILED';
}

async function main(): Promise<void> {
  let database: Awaited<ReturnType<typeof createDatabaseCompositionForRuntime>>;
  let app: Awaited<ReturnType<typeof createApiApplication>>['app'] | undefined;
  let cleanupAfterStartupFailure: (() => Promise<void>) | undefined;

  try {
    database = await createDatabaseCompositionForRuntime();
    app = (await createApiApplication(database?.options ?? {})).app;

    if (database === undefined) {
      app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    } else {
      const deadlineMs = productionShutdownDeadlineMs();
      const shutdown = createGracefulShutdownHandler(
        async () => {
          await app?.close();
        },
        database.disconnect,
        { deadlineMs },
      );
      const disposeSignalHandlers = registerProductionShutdownHandlers(shutdown, { deadlineMs });
      cleanupAfterStartupFailure = createStartupCleanupHandler(disposeSignalHandlers, shutdown);
    }

    await app.listen({ host: '0.0.0.0', port: listenPort() });
  } catch (error: unknown) {
    if (cleanupAfterStartupFailure !== undefined) {
      await cleanupAfterStartupFailure().catch(() => undefined);
    } else {
      await app?.close().catch(() => undefined);
      await database?.disconnect().catch(() => undefined);
    }
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(startupErrorMessage(error));
});
