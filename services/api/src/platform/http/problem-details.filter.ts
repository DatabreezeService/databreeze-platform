import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthenticationProblemError } from '../../features/iam/application/authentication-problem.error.js';
import { SessionProblemError } from '../../features/iam/application/session-problem.error.js';
import { RequestTenantContextProblemError } from './session-tenant-context.adapter.js';
import { NotReadyError } from '../../features/system/application/not-ready.error.js';
import { InputValidationException } from './input-validation.exception.js';
import { createProblem, type ProblemInput } from './problem-details.js';
import { getRequestContext } from './request-context.js';

function frameworkStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

function describe(error: unknown, correlationId: string): ProblemInput {
  if (error instanceof AuthenticationProblemError) {
    const unavailable = error.code === 'AUTHENTICATION_UNAVAILABLE';
    return {
      code: unavailable ? 'AUTHENTICATION_UNAVAILABLE' : 'AUTHENTICATION_FAILED',
      correlationId,
      messageKey: unavailable
        ? 'api.error.authentication_unavailable'
        : 'api.error.authentication_failed',
      retryable: unavailable,
      status: unavailable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.UNAUTHORIZED,
    };
  }
  if (error instanceof SessionProblemError) {
    const unavailable = error.code === 'SESSION_UNAVAILABLE';
    return {
      code: error.code,
      correlationId,
      messageKey: unavailable ? 'api.error.session_unavailable' : 'api.error.session_invalid',
      retryable: unavailable,
      status: unavailable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.UNAUTHORIZED,
    };
  }
  if (error instanceof RequestTenantContextProblemError) {
    const invalidContext = error.code === 'CONTEXT_INVALID';
    return {
      code: invalidContext ? 'CONTEXT_INVALID' : 'AUTHENTICATION_FAILED',
      correlationId,
      messageKey: invalidContext
        ? 'api.error.context_invalid'
        : 'api.error.authentication_failed',
      retryable: false,
      status: invalidContext ? HttpStatus.BAD_REQUEST : HttpStatus.UNAUTHORIZED,
    };
  }
  if (error instanceof InputValidationException) {
    return {
      code: 'VALIDATION_FAILED',
      correlationId,
      fieldErrors: error.fieldErrors,
      messageKey: 'api.error.validation_failed',
      retryable: false,
      status: HttpStatus.BAD_REQUEST,
    };
  }
  if (error instanceof NotReadyError) {
    return {
      code: 'NOT_READY',
      correlationId,
      messageKey: 'api.error.not_ready',
      retryable: true,
      status: HttpStatus.SERVICE_UNAVAILABLE,
    };
  }

  const status = error instanceof HttpException ? error.getStatus() : frameworkStatus(error);
  if (status === HttpStatus.NOT_FOUND) {
    return {
      code: 'ROUTE_NOT_FOUND',
      correlationId,
      messageKey: 'api.error.route_not_found',
      retryable: false,
      status,
    };
  }
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      correlationId,
      messageKey: 'api.error.payload_too_large',
      retryable: false,
      status,
    };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      code: 'BAD_REQUEST',
      correlationId,
      messageKey: 'api.error.bad_request',
      retryable: false,
      status,
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    correlationId,
    messageKey: 'api.error.internal',
    retryable: true,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  };
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const context = getRequestContext(request);
    const input = describe(exception, context.correlationId);
    reply.code(input.status).type('application/problem+json').send(createProblem(input));
  }
}
