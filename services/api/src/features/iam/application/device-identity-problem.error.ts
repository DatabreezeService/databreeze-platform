export type DeviceIdentityProblemCodeV1 =
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_REQUEST_REJECTED'
  | 'DEVICE_REVISION_CONFLICT'
  | 'DEVICE_SCOPE_DENIED'
  | 'DEVICE_UNAVAILABLE';

export class DeviceIdentityProblemError extends Error {
  public constructor(readonly code: DeviceIdentityProblemCodeV1) {
    super(code);
  }
}
