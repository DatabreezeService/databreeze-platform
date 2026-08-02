export const READINESS_PORT = Symbol('READINESS_PORT');

export interface ReadinessPort {
  check(): Promise<boolean>;
}
