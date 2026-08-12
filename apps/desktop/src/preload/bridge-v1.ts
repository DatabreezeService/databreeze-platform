import {
  DESKTOP_IPC_CHANNELS,
  parseDesktopSafeState,
  parseSidecarSafeStatus,
  type DesktopBridgeV1,
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

export type DesktopInvoke = (
  channel: DesktopIpcChannel | FolderIpcChannel | WorkbenchIpcChannel,
  payload?: unknown,
) => Promise<unknown>;

function rejectUnexpectedArguments(argumentsList: readonly unknown[]): void {
  if (argumentsList.length !== 0) throw new Error('DESKTOP_REQUEST_REJECTED');
}

function rejectExtraArguments(argumentsList: readonly unknown[], expected: number): void {
  if (argumentsList.length !== expected) throw new Error('DESKTOP_REQUEST_REJECTED');
}

function parseOrRejectRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new Error('DESKTOP_REQUEST_REJECTED');
  }
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
  const folders = Object.freeze({
    select: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseFolderSelectResult(await invoke(FOLDER_IPC_CHANNELS.select));
    },
    create: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseFolderCreateRequest(argumentsList[0]));
      return parseFolderBindingSafeStatus(await invoke(FOLDER_IPC_CHANNELS.create, request));
    },
    readStatus: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseFolderBindingIdRequest(argumentsList[0]));
      return parseFolderBindingSafeStatus(await invoke(FOLDER_IPC_CHANNELS.readStatus, request));
    },
    updateManifest: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() =>
        parseFolderManifestUpdateRequest(argumentsList[0]),
      );
      return parseFolderBindingSafeStatus(
        await invoke(FOLDER_IPC_CHANNELS.updateManifest, request),
      );
    },
    disable: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseFolderBindingIdRequest(argumentsList[0]));
      return parseFolderBindingSafeStatus(await invoke(FOLDER_IPC_CHANNELS.disable, request));
    },
    listReviewQueue: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseFolderReviewQueue(await invoke(FOLDER_IPC_CHANNELS.listReviewQueue));
    },
  });
  const workbench = Object.freeze({
    readSession: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseWorkbenchSessionSnapshot(await invoke(WORKBENCH_IPC_CHANNELS.sessionRead));
    },
    listCatalogPage: async (...argumentsList: unknown[]) => {
      if (argumentsList.length > 1) throw new Error('DESKTOP_REQUEST_REJECTED');
      const request = parseOrRejectRequest(() =>
        parseWorkbenchCatalogPageRequest(argumentsList[0]),
      );
      return parseWorkbenchCatalogPage(
        await invoke(WORKBENCH_IPC_CHANNELS.catalogPage, request),
      );
    },
    readOriginalDescriptor: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseWorkbenchOriginalRequest(argumentsList[0]));
      return parseWorkbenchOriginalDescriptor(
        await invoke(WORKBENCH_IPC_CHANNELS.originalDescriptor, request),
      );
    },
    decideFolderReview: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() =>
        parseWorkbenchFolderReviewDecision(argumentsList[0]),
      );
      return parseWorkbenchAccepted(
        await invoke(WORKBENCH_IPC_CHANNELS.folderReviewDecide, request),
      );
    },
    runAgentTurn: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseWorkbenchAgentTurnRequest(argumentsList[0]));
      return parseWorkbenchAccepted(await invoke(WORKBENCH_IPC_CHANNELS.agentTurn, request));
    },
    getSyncStatus: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseWorkbenchSyncStatus(await invoke(WORKBENCH_IPC_CHANNELS.syncStatus));
    },
    importSource: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseWorkbenchImportRequest(argumentsList[0]));
      return parseWorkbenchAccepted(await invoke(WORKBENCH_IPC_CHANNELS.importSource, request));
    },
    signInWithPassword: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() =>
        parseWorkbenchPasswordSignInRequest(argumentsList[0]),
      );
      return parseWorkbenchSessionSnapshot(
        await invoke(WORKBENCH_IPC_CHANNELS.signInPassword, request),
      );
    },
    verifyOtp: async (...argumentsList: unknown[]) => {
      rejectExtraArguments(argumentsList, 1);
      const request = parseOrRejectRequest(() => parseWorkbenchOtpRequest(argumentsList[0]));
      return parseWorkbenchSessionSnapshot(
        await invoke(WORKBENCH_IPC_CHANNELS.verifyOtp, request),
      );
    },
    startGoogleOidc: async (...argumentsList: unknown[]) => {
      rejectUnexpectedArguments(argumentsList);
      return parseWorkbenchAccepted(await invoke(WORKBENCH_IPC_CHANNELS.startGoogleOidc));
    },
  });
  return Object.freeze({ v1: Object.freeze({ session, sidecar, folders, workbench }) });
}
