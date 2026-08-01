import {
  DESKTOP_IPC_CHANNELS,
  parseDesktopSafeState,
  parseSidecarSafeStatus,
  type DesktopBridgeV1,
  type DesktopIpcChannel,
} from '../shared/desktop-contract-v1.ts';

export type DesktopInvoke = (channel: DesktopIpcChannel) => Promise<unknown>;

function rejectUnexpectedArguments(argumentsList: readonly unknown[]): void {
  if (argumentsList.length !== 0) throw new Error('DESKTOP_REQUEST_REJECTED');
}

export function createDesktopBridgeV1(invoke: DesktopInvoke): DesktopBridgeV1 {
  const session = Object.freeze({
    getSafeState: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseDesktopSafeState(await invoke(DESKTOP_IPC_CHANNELS.sessionGetSafeState));
    },
  });
  const sidecar = Object.freeze({
    getStatus: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseSidecarSafeStatus(await invoke(DESKTOP_IPC_CHANNELS.sidecarGetStatus));
    },
  });
  return Object.freeze({ v1: Object.freeze({ session, sidecar }) });
}
