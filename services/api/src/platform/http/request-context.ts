import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  DEFAULT_CSRF_ALLOWED_ORIGINS_V1,
  evaluateCsrfRequestV1,
  type CsrfProtectionOptionsV1,
} from './csrf-protection.js';
import { createProblem } from './problem-details.js';

export interface RequestContext {
  readonly correlationId: string;
  readonly requestId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly traceFlags?: string;
}

const requestContexts = new WeakMap<FastifyRequest, RequestContext>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const traceparentPattern = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export type CorrelationHeaderResult =
  | { readonly accepted: true; readonly correlationId: string }
  | { readonly accepted: false };

export type TraceparentHeaderResult =
  | {
      readonly accepted: true;
      readonly traceId?: string;
      readonly spanId?: string;
      readonly traceFlags?: string;
    }
  | { readonly accepted: false };

export interface RequestContextOptions {
  readonly csrf?: Partial<CsrfProtectionOptionsV1>;
}

/** Production must explicitly declare browser origins; development defaults are not deployable. */
export function validateRequestContextOptionsV1(
  options: RequestContextOptions = {},
  environment = process.env['NODE_ENV'],
): void {
  if (environment !== 'production') return;
  const origins = options.csrf?.allowedOrigins;
  if (!origins || origins.length === 0) throw new Error('CSRF_ALLOWED_ORIGINS_REQUIRED');
  if (
    origins.some((origin) => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '';
      } catch {
        return true;
      }
    })
  )
    throw new Error('CSRF_ALLOWED_ORIGINS_INVALID');
}

export function parseCorrelationHeader(
  values: readonly string[],
  requestId: string,
): CorrelationHeaderResult {
  if (values.length === 0) return { accepted: true, correlationId: requestId };
  if (values.length !== 1) return { accepted: false };
  const value = values[0];
  if (value === undefined || value.length > 128 || !uuidPattern.test(value)) {
    return { accepted: false };
  }
  return { accepted: true, correlationId: value };
}

/** Parses one W3C traceparent without reflecting malformed or provider values. */
export function parseTraceparentHeader(values: readonly string[]): TraceparentHeaderResult {
  if (values.length === 0) return { accepted: true };
  if (values.length !== 1) return { accepted: false };
  const value = values[0];
  if (value === undefined) return { accepted: false };
  const match = traceparentPattern.exec(value);
  if (!match) return { accepted: false };
  const [, version, traceId, spanId, traceFlags] = match;
  if (
    !version ||
    version.toLowerCase() === 'ff' ||
    !traceId ||
    traceId === '0'.repeat(32) ||
    !spanId ||
    spanId === '0'.repeat(16) ||
    !traceFlags
  )
    return { accepted: false };
  return {
    accepted: true,
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags: traceFlags.toLowerCase(),
  };
}

export function getRequestContext(request: FastifyRequest): RequestContext {
  const context = requestContexts.get(request);
  if (context === undefined) throw new Error('Request context is unavailable');
  return context;
}

export function installRequestContext(
  fastify: FastifyInstance,
  options: RequestContextOptions = {},
): void {
  validateRequestContextOptionsV1(options);
  fastify.addHook('onRequest', (request, reply, done) => {
    const requestId = randomUUID();
    const context: RequestContext = { correlationId: requestId, requestId };
    requestContexts.set(request, context);
    reply.header('X-Request-Id', context.requestId);
    const values: string[] = [];
    const traceValues: string[] = [];
    for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
      const name = request.raw.rawHeaders[index]?.toLowerCase();
      if (name === 'x-correlation-id') {
        const value = request.raw.rawHeaders[index + 1];
        if (value !== undefined) values.push(value);
      } else if (name === 'traceparent') {
        const value = request.raw.rawHeaders[index + 1];
        if (value !== undefined) traceValues.push(value);
      }
    }
    const parsed = parseCorrelationHeader(values, requestId);
    if (!parsed.accepted) {
      reply.header('X-Correlation-Id', requestId);
      reply
        .code(400)
        .type('application/problem+json')
        .send(
          createProblem({
            code: 'CORRELATION_ID_INVALID',
            correlationId: requestId,
            messageKey: 'api.error.correlation_id_invalid',
            retryable: false,
            status: 400,
          }),
        );
      return;
    }
    const parsedTrace = parseTraceparentHeader(traceValues);
    if (!parsedTrace.accepted) {
      reply.header('X-Correlation-Id', requestId);
      reply
        .code(400)
        .type('application/problem+json')
        .send(
          createProblem({
            code: 'CORRELATION_ID_INVALID',
            correlationId: requestId,
            messageKey: 'api.error.correlation_id_invalid',
            retryable: false,
            status: 400,
          }),
        );
      return;
    }
    const acceptedContext = {
      correlationId: parsed.correlationId,
      requestId,
      ...(parsedTrace.traceId
        ? {
            traceId: parsedTrace.traceId,
            spanId: parsedTrace.spanId,
            traceFlags: parsedTrace.traceFlags,
          }
        : {}),
    };
    requestContexts.set(request, acceptedContext);
    reply.header('X-Correlation-Id', acceptedContext.correlationId);
    const csrf = evaluateCsrfRequestV1(
      { method: request.method, headers: request.headers },
      { allowedOrigins: options.csrf?.allowedOrigins ?? DEFAULT_CSRF_ALLOWED_ORIGINS_V1 },
    );
    if (!csrf.accepted) {
      reply
        .code(403)
        .type('application/problem+json')
        .send(
          createProblem({
            code: csrf.code,
            correlationId: acceptedContext.correlationId,
            messageKey:
              csrf.code === 'ORIGIN_INVALID'
                ? 'api.error.origin_invalid'
                : csrf.code === 'CSRF_REQUIRED'
                  ? 'api.error.csrf_required'
                  : 'api.error.csrf_invalid',
            retryable: false,
            status: 403,
          }),
        );
      return;
    }
    done();
  });
}
