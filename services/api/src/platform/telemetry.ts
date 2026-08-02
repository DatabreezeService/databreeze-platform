import { createStructuredLoggerV1, type CorrelationContextV1 } from '@databreeze/telemetry/v1';

export const apiLoggerV1 = createStructuredLoggerV1({ component: 'api' });

export function logApiOutcomeV1(
  event: string,
  correlation: CorrelationContextV1,
  attributes: Record<string, unknown> = {},
) {
  return apiLoggerV1.emit('info', event, correlation, attributes);
}
