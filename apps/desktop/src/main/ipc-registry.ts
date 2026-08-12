import type { FolderManifestService } from '../application/folder-manifest.service.ts';
import type { LocalStatePort } from '../application/local-state.port.ts';
import type { SidecarLifecyclePort } from '../application/sidecar-lifecycle.port.ts';
import type { FolderWatcherLifecycle } from './folder-watcher-lifecycle.ts';
import type { WorkbenchMainPort } from './adapters/fail-closed-workbench.adapter.ts';
import { createFailClosedWorkbenchPort } from './adapters/fail-closed-workbench.adapter.ts';
import {
  DESKTOP_IPC_CHANNELS,
  parseDesktopSafeState,
  parseSidecarSafeStatus,
  type DesktopIpcChannel,
} from '../shared/desktop-contract-v1.ts';
import {
  FOLDER_IPC_CHANNELS,
  parseFolderBindingIdRequest,
  parseFolderBindingSafeStatus,
  parseFolderCreateRequest,
  parseFolderManifestUpdateRequest,
  parseFolderSelectResult,
  type FolderIpcChannel,
} from '../shared/folder-binding-contract-v1.ts';
import { parseFolderReviewQueue } from '../shared/folder-intake-contract-v1.ts';
import {
  WORKBENCH_IPC_CHANNELS,
  parseWorkbenchAccepted,
  parseWorkbenchAgentTurnRequest,
  parseWorkbenchCatalogPage,
  parseWorkbenchCatalogPageRequest,
  parseWorkbenchFolderReviewDecision,
  parseWorkbenchImportRequest,
  parseWorkbenchOriginalDescriptor,
  parseWorkbenchOriginalRequest,
  parseWorkbenchOtpRequest,
  parseWorkbenchPasswordSignInRequest,
  parseWorkbenchSessionSnapshot,
  parseWorkbenchSyncStatus,
  type WorkbenchIpcChannel,
} from '../shared/workbench-contract-v1.ts';

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
  readonly folders?: FolderManifestService;
  readonly folderWatchers?: FolderWatcherLifecycle;
  readonly workbench?: Partial<WorkbenchMainPort>;
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

function guardedPayloadHandler(
  expectedRendererUrl: string,
  getActiveWindow: () => WindowLike | null,
  parseRequest: (value: unknown) => unknown,
  operation: (request: unknown) => Promise<unknown>,
  parseResult: (value: unknown) => unknown,
  allowEmptyPayload = false,
): IpcHandler {
  return async (event, ...args) => {
    authorize(event, getActiveWindow(), expectedRendererUrl);
    if (allowEmptyPayload) {
      if (args.length !== 0) throw safeError('DESKTOP_REQUEST_REJECTED');
    } else if (args.length !== 1) {
      throw safeError('DESKTOP_REQUEST_REJECTED');
    }

    let request: unknown;
    try {
      request = allowEmptyPayload ? undefined : parseRequest(args[0]);
    } catch {
      throw safeError('DESKTOP_REQUEST_REJECTED');
    }

    let rawResult: unknown;
    try {
      rawResult = await operation(request);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('FOLDER_')) {
        throw safeError(error.message);
      }
      if (error instanceof Error && error.message.startsWith('WORKBENCH_')) {
        throw safeError(error.message);
      }
      throw safeError('DESKTOP_INTERNAL_ERROR');
    }
    try {
      return parseResult(rawResult);
    } catch {
      throw safeError('DESKTOP_RESULT_REJECTED');
    }
  };
}

async function unwrapFolderResult<T>(
  result: Promise<{ accepted: true; value: T } | { accepted: false; code: string }>,
): Promise<T> {
  const resolved = await result;
  if (!resolved.accepted) throw safeError(resolved.code);
  return resolved.value;
}

function resolveWorkbench(partial: Partial<WorkbenchMainPort> | undefined): WorkbenchMainPort {
  const fallback = createFailClosedWorkbenchPort();
  if (partial === undefined) return fallback;
  return {
    readSession: partial.readSession?.bind(partial) ?? fallback.readSession,
    listCatalogPage: partial.listCatalogPage?.bind(partial) ?? fallback.listCatalogPage,
    readOriginalDescriptor:
      partial.readOriginalDescriptor?.bind(partial) ?? fallback.readOriginalDescriptor,
    decideFolderReview: partial.decideFolderReview?.bind(partial) ?? fallback.decideFolderReview,
    runAgentTurn: partial.runAgentTurn?.bind(partial) ?? fallback.runAgentTurn,
    getSyncStatus: partial.getSyncStatus?.bind(partial) ?? fallback.getSyncStatus,
    importSource: partial.importSource?.bind(partial) ?? fallback.importSource,
    signInWithPassword: partial.signInWithPassword?.bind(partial) ?? fallback.signInWithPassword,
    verifyOtp: partial.verifyOtp?.bind(partial) ?? fallback.verifyOtp,
    startGoogleOidc: partial.startGoogleOidc?.bind(partial) ?? fallback.startGoogleOidc,
  };
}

export function registerDesktopIpcV1({
  expectedRendererUrl,
  getActiveWindow,
  ipcMain,
  localState,
  sidecar,
  folders,
  folderWatchers,
  workbench: workbenchPartial,
}: DesktopIpcRegistrationInput): () => void {
  const previous = registrations.get(ipcMain);
  if (previous !== undefined) previous.active = false;
  const workbench = resolveWorkbench(workbenchPartial);

  const allChannels: readonly string[] = [
    ...Object.values(DESKTOP_IPC_CHANNELS),
    ...Object.values(FOLDER_IPC_CHANNELS),
    ...Object.values(WORKBENCH_IPC_CHANNELS),
  ];
  for (const channel of allChannels) ipcMain.removeHandler(channel);

  const handlers: Record<DesktopIpcChannel | FolderIpcChannel | WorkbenchIpcChannel, IpcHandler> = {
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
    [FOLDER_IPC_CHANNELS.select]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => undefined,
      async () => {
        if (folders === undefined) throw safeError('FOLDER_UNAVAILABLE');
        return unwrapFolderResult(folders.selectFolder());
      },
      parseFolderSelectResult,
      true,
    ),
    [FOLDER_IPC_CHANNELS.create]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseFolderCreateRequest,
      async (request) => {
        if (folders === undefined) throw safeError('FOLDER_UNAVAILABLE');
        const binding = await unwrapFolderResult(folders.createBinding(request as never));
        try {
          folderWatchers?.attach(binding.bindingId);
        } catch {
          await folders.disable(binding.bindingId);
          folderWatchers?.detach(binding.bindingId);
          throw safeError('FOLDER_WATCHER_UNAVAILABLE');
        }
        return binding;
      },
      parseFolderBindingSafeStatus,
    ),
    [FOLDER_IPC_CHANNELS.readStatus]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseFolderBindingIdRequest,
      async (request) => {
        if (folders === undefined) throw safeError('FOLDER_UNAVAILABLE');
        return unwrapFolderResult(folders.readStatus((request as { bindingId: string }).bindingId));
      },
      parseFolderBindingSafeStatus,
    ),
    [FOLDER_IPC_CHANNELS.updateManifest]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseFolderManifestUpdateRequest,
      async (request) => {
        if (folders === undefined) throw safeError('FOLDER_UNAVAILABLE');
        return unwrapFolderResult(folders.updateManifest(request as never));
      },
      parseFolderBindingSafeStatus,
    ),
    [FOLDER_IPC_CHANNELS.disable]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseFolderBindingIdRequest,
      async (request) => {
        if (folders === undefined) throw safeError('FOLDER_UNAVAILABLE');
        const bindingId = (request as { bindingId: string }).bindingId;
        const binding = await unwrapFolderResult(folders.disable(bindingId));
        folderWatchers?.detach(bindingId);
        return binding;
      },
      parseFolderBindingSafeStatus,
    ),
    [FOLDER_IPC_CHANNELS.listReviewQueue]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => undefined,
      async () => {
        if (folderWatchers === undefined) return Object.freeze([]);
        return folderWatchers.listReviewQueue();
      },
      parseFolderReviewQueue,
      true,
    ),
    [WORKBENCH_IPC_CHANNELS.sessionRead]: guardedHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => workbench.readSession(),
      parseWorkbenchSessionSnapshot,
    ),
    [WORKBENCH_IPC_CHANNELS.catalogPage]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchCatalogPageRequest,
      (request) => workbench.listCatalogPage(request as { cursor: string | null }),
      parseWorkbenchCatalogPage,
    ),
    [WORKBENCH_IPC_CHANNELS.originalDescriptor]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchOriginalRequest,
      (request) => workbench.readOriginalDescriptor(request as { descriptorId: string }),
      parseWorkbenchOriginalDescriptor,
    ),
    [WORKBENCH_IPC_CHANNELS.folderReviewDecide]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchFolderReviewDecision,
      (request) =>
        workbench.decideFolderReview(
          request as { reviewId: string; decision: 'approve' | 'reject' },
        ),
      parseWorkbenchAccepted,
    ),
    [WORKBENCH_IPC_CHANNELS.agentTurn]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchAgentTurnRequest,
      (request) => workbench.runAgentTurn(request as { message: string }),
      parseWorkbenchAccepted,
    ),
    [WORKBENCH_IPC_CHANNELS.syncStatus]: guardedHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => workbench.getSyncStatus(),
      parseWorkbenchSyncStatus,
    ),
    [WORKBENCH_IPC_CHANNELS.importSource]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchImportRequest,
      (request) => workbench.importSource(request as { profile: never }),
      parseWorkbenchAccepted,
    ),
    [WORKBENCH_IPC_CHANNELS.signInPassword]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchPasswordSignInRequest,
      (request) => workbench.signInWithPassword(request as { email: string; password: string }),
      parseWorkbenchSessionSnapshot,
    ),
    [WORKBENCH_IPC_CHANNELS.verifyOtp]: guardedPayloadHandler(
      expectedRendererUrl,
      getActiveWindow,
      parseWorkbenchOtpRequest,
      (request) => workbench.verifyOtp(request as { code: string }),
      parseWorkbenchSessionSnapshot,
    ),
    [WORKBENCH_IPC_CHANNELS.startGoogleOidc]: guardedHandler(
      expectedRendererUrl,
      getActiveWindow,
      () => workbench.startGoogleOidc(),
      parseWorkbenchAccepted,
    ),
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);

  const registration = { active: true };
  registrations.set(ipcMain, registration);
  return () => {
    if (!registration.active) return;
    registration.active = false;
    for (const channel of allChannels) ipcMain.removeHandler(channel);
    registrations.delete(ipcMain);
  };
}
