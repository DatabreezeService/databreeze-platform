import { createStructuredLoggerV1, type CorrelationContextV1 } from '@databreeze/telemetry/v1';

export const webLoggerV1 = createStructuredLoggerV1({
  component: 'web',
  sink: (record) => {
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('databreeze:telemetry', { detail: record }));
  },
});

export function logWebOutcomeV1(
  event: string,
  correlation: CorrelationContextV1,
  attributes: Record<string, unknown> = {},
) {
  return webLoggerV1.emit('info', event, correlation, attributes);
}
