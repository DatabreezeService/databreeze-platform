import 'reflect-metadata';

import type { OpenAPIObject } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import type { IamModuleOptions } from './features/iam/iam.module.js';
import type { IaeModuleOptions } from './features/iae/iae.module.js';
import type { DsmModuleOptions } from './features/dsm/dsm.module.js';
import type { DsoModuleOptions } from './features/dso/dso.module.js';
import type { SaModuleOptions } from './features/sa/sa.module.js';
import type { ClientCompatibilityPort } from './features/system/application/client-compatibility.port.js';
import type { ReadinessPort } from './features/system/application/readiness.port.js';
import { ProblemDetailsFilter } from './platform/http/problem-details.filter.js';
import { configureOpenApi } from './platform/http/openapi.js';
import {
  installRequestContext,
  type RequestContextOptions,
} from './platform/http/request-context.js';
import { createValidationPipe } from './platform/http/validation.js';

export interface ApiApplication {
  readonly app: NestFastifyApplication;
  readonly openApi: OpenAPIObject | object;
}

export interface ApiApplicationOptions
  extends IamModuleOptions,
    IaeModuleOptions,
    DsmModuleOptions,
    DsoModuleOptions,
    SaModuleOptions {
  readonly compatibilityPort?: ClientCompatibilityPort;
  readonly readinessPort?: ReadinessPort;
  readonly requestContext?: RequestContextOptions;
}

export async function createApiApplication(
  options: ApiApplicationOptions = {},
): Promise<ApiApplication> {
  const adapter = new FastifyAdapter({ bodyLimit: 65_536, logger: false });
  installRequestContext(adapter.getInstance(), options.requestContext);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(options),
    adapter,
    {
      abortOnError: true,
      logger: false,
    },
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  const openApi = configureOpenApi(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, openApi };
}
