import type { LocalStatePort } from '../application/local-state.port.ts';
import type { SidecarLifecyclePort } from '../application/sidecar-lifecycle.port.ts';
import {
  DESKTOP_IPC_CHANNELS,
  parseDesktopSafeState,
  parseSidecarSafeStatus,
  type DesktopIpcChannel,
} from '../shared/desktop-contract-v1.ts';

interface SenderFrameLike {
  readonly url: string;
}

interface WebContentsLike {
  readonly mainFrame: SenderFrameLike;
}

interface WindowLike {
  readonly webContents: WebContentsLike;
  isDestroyed(): boolean;
}

interface IpcEventLike {
  readonly sender: unknown;
  readonly senderFrame?: SenderFrameLike;
}

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

interface IpcMainLike {
  handle(channel: string, handler: IpcHandler): void;
  removeHandler(channel: string): void;
}

export interface DesktopIpcRegistrationInput {
  readonly expectedRendererUrl: string;
  readonly getActiveWindow: () => WindowLike | null;
  readonly ipcMain: IpcMainLike;
  readonly localState: LocalStatePort;
  readonly sidecar: SidecarLifecyclePort;
}

interface ActiveRegistration {
  active: boolean;
}

const registrations = new WeakMap<IpcMainLike, ActiveRegistration>();

function safeError(code: string): Error {
  return new Error(code);
}

function authorize(
  eventValue: unknown,
  activeWindow: WindowLike | null,
  expectedRendererUrl: string,
): void {
  if (typeof eventValue !== 'object' || eventValue === null) {
    throw safeError('DESKTOP_ACCESS_DENIED');
  }
  const event = eventValue as IpcEventLike;
  if (
    activeWindow === null ||
    activeWindow.isDestroyed() ||
    event.sender !== activeWindow.webContents ||
    event.senderFrame === undefined ||
    event.senderFrame !== activeWindow.webContents.mainFrame ||
    event.senderFrame.url !== expectedRendererUrl
  ) {
    throw safeError('DESKTOP_ACCESS_DENIED');
  }
}

function guardedHandler(
  expectedRendererUrl: string,
  getActiveWindow: () => WindowLike | null,
  operation: () => Promise<unknown>,
  parseResult: (value: unknown) => unknown,
): IpcHandler {
  return async (event, ...args) => {
    authorize(event, getActiveWindow(), expectedRendererUrl);
    if (args.length !== 0) throw safeError('DESKTOP_REQUEST_REJECTED');

    let rawResult: unknown;
    try {
      rawResult = await operation();
    } catch {
      throw safeError('DESKTOP_INTERNAL_ERROR');
    }
    try {
      return parseResult(rawResult);
    } catch {
      throw safeError('DESKTOP_RESULT_REJECTED');
    }
  };
}

export function registerDesktopIpcV1({
  expectedRendererUrl,
  getActiveWindow,
  ipcMain,
  localState,
  sidecar,
}: DesktopIpcRegistrationInput): () => void {
  const previous = registrations.get(ipcMain);
  if (previous !== undefined) previous.active = false;

  for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) ipcMain.removeHandler(channel);
  const handlers: Record<DesktopIpcChannel, IpcHandler> = {
    [DESKTOP_IPC_CHANNELS.sessionGetSafeState]: guardedHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => localState.getSafeState(),
      parseDesktopSafeState,
    ),
    [DESKTOP_IPC_CHANNELS.sidecarGetStatus]: guardedHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => sidecar.getStatus(),
      parseSidecarSafeStatus,
    ),
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);

  const registration = { active: true };
  registrations.set(ipcMain, registration);
  return () => {
    if (!registration.active) return;
    registration.active = false;
    for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) ipcMain.removeHandler(channel);
    registrations.delete(ipcMain);
  };
}
