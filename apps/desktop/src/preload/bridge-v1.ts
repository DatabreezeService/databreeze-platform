import {
  DESKTOP_IPC_CHANNELS,
  parseDesktopSafeState,
  parseSidecarSafeStatus,
  type DesktopBridgeV1,
  type DesktopIpcChannel,
} from '../shared/desktop-contract-v1.ts';

export type DesktopInvoke = (channel: DesktopIpcChannel) => Promise<unknown>;

export function createDesktopBridgeV1(invoke: DesktopInvoke): DesktopBridgeV1 {
  const session = Object.freeze({
    getSafeState: async () =>
      parseDesktopSafeState(await invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState)),
  });
  const sidecar = Object.freeze({
    getStatus: async () =>
      parseSidecarSafeStatus(await invoke(DESKTOP_IPC_CHANNELS.sidecarGetStatus)),
  });
  return Object.freeze({ v1: Object.freeze({ session, sidecar }) });
}
