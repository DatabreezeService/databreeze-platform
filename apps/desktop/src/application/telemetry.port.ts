import type { CorrelationContextV1, TelemetryLevelV1 } from '@databreeze/telemetry/v1';

export interface DesktopTelemetryPortV1 {
  emit(
    level: TelemetryLevelV1,
    event: string,
    correlation: CorrelationContextV1,
    attributes?: Record<string, unknown>,
  ): void;
}
