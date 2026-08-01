import {
  createStructuredLoggerV1,
  type CorrelationContextV1,
  type TelemetryLevelV1,
  type TelemetryRecordV1,
} from '@databreeze/telemetry/v1';

export interface DesktopTelemetryPortV1 {
  emit(
    level: TelemetryLevelV1,
    event: string,
    correlation: CorrelationContextV1,
    attributes?: Record<string, unknown>,
  ): void;
}

export function createDesktopTelemetryPortV1(
  sink: (record: TelemetryRecordV1) => void,
): DesktopTelemetryPortV1 {
  const logger = createStructuredLoggerV1({ component: 'desktop', sink });
  return {
    emit(level, event, correlation, attributes) {
      logger.emit(level, event, correlation, attributes);
    },
  };
}
