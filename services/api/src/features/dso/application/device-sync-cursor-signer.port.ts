import type { DeviceSyncCursorSignerV1 } from '@databreeze/domain/device-sync/v1';

export const DEVICE_SYNC_CURSOR_SIGNER = Symbol('DEVICE_SYNC_CURSOR_SIGNER');

/** Production composition supplies a key-backed signer; the default never authorizes a cursor. */
export class UnavailableDeviceSyncCursorSigner implements DeviceSyncCursorSignerV1 {
  public sign(_payload: string): string {
    void _payload;
    return '';
  }

  public verify(_payload: string, _signature: string): boolean {
    void _payload;
    void _signature;
    return false;
  }
}
