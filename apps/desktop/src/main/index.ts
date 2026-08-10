import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { FolderIntakeService } from '../application/folder-intake.service.ts';
import { FolderManifestService } from '../application/folder-manifest.service.ts';
import { fingerprintLocalTabularFile } from '../application/local-tabular-fingerprint.ts';
import { StableFileDetector } from '../application/stable-file-detector.ts';
import {
  DDA_FOLDER_INTAKE_HANDLER_DIGEST,
  DdaSidecarClientAdapter,
} from './adapters/dda-sidecar-client.adapter.ts';
import { DsoCapabilityClientAdapter } from './adapters/dso-capability-client.adapter.ts';
import { LockedLocalStateAdapter } from './adapters/locked-local-state.adapter.ts';
import { UnavailableSidecarAdapter } from './adapters/unavailable-sidecar.adapter.ts';
import { WindowsFolderBindingAdapter } from './adapters/windows-folder-binding.adapter.ts';
import { WindowsFolderWatcherAdapter } from './adapters/windows-folder-watcher.adapter.ts';
import {
  createDesktopWindow,
  type BrowserWindowConstructor,
  type DesktopSessionLike,
  type DesktopWindowLike,
} from './desktop-window.ts';
import { registerDesktopIpcV1, type DesktopIpcRegistrationInput } from './ipc-registry.ts';
import { FolderWatcherLifecycle } from './folder-watcher-lifecycle.ts';

const require = createRequire(import.meta.url);
const iconPath = require.resolve(
  '@databreeze/design-tokens/brand/generated/desktop/application.ico',
);
const preloadPath = path.resolve(import.meta.dirname, '../preload/index.cjs');
const rendererFilePath = path.resolve(import.meta.dirname, '../renderer/index.html');

let activeWindow: BrowserWindow | null = null;
let disposeIpc: (() => void) | undefined;
let disposeFolderWatchers: (() => void) | undefined;

async function fingerprintFolderFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath);
    return fingerprintLocalTabularFile(filePath, content);
  } catch {
    return { rejected: 'MALFORMED_CONTENT' as const };
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function createDsoClient(): DsoCapabilityClientAdapter | null {
  const baseUrl = readEnv('DATABREEZE_API_BASE_URL');
  const deviceId = readEnv('DATABREEZE_DEVICE_ID');
  const organizationId = readEnv('DATABREEZE_ORGANIZATION_ID');
  const workspaceId = readEnv('DATABREEZE_WORKSPACE_ID');
  const epochRaw = readEnv('DATABREEZE_AUTHORIZATION_EPOCH');
  const authorizationEpoch = epochRaw === undefined ? Number.NaN : Number(epochRaw);
  if (
    baseUrl === undefined ||
    deviceId === undefined ||
    organizationId === undefined ||
    workspaceId === undefined ||
    !Number.isInteger(authorizationEpoch) ||
    authorizationEpoch < 1
  ) {
    return null;
  }
  return new DsoCapabilityClientAdapter({
    baseUrl,
    deviceId,
    organizationId,
    workspaceId,
    authorizationEpoch,
    getAccessToken: () => Promise.resolve(readEnv('DATABREEZE_ACCESS_TOKEN') ?? null),
  });
}

function createSidecar() {
  const controlPlaneKey = readEnv('DATABREEZE_SIDECAR_CONTROL_KEY');
  if (controlPlaneKey === undefined || !/^[a-f0-9]{64}$/iu.test(controlPlaneKey)) {
    return new UnavailableSidecarAdapter();
  }
  return new DdaSidecarClientAdapter({
    transport: {
      execute: () => Promise.reject(new Error('SIDECAR_UNAVAILABLE')),
    },
    controlPlaneKeyId: readEnv('DATABREEZE_SIDECAR_CONTROL_KEY_ID') ?? 'cpk_local',
    controlPlaneKey: controlPlaneKey.toLowerCase(),
    pinnedDigests: {
      'dda.folder.intake': DDA_FOLDER_INTAKE_HANDLER_DIGEST,
    },
    engineVersion: '0.1.0',
    protocolVersion: '1.0',
  });
}

async function openDesktopWindow(): Promise<void> {
  const localState = new LockedLocalStateAdapter({
    applicationVersion: app.getVersion(),
    locale: 'vi-VN',
  });
  const sidecar = createSidecar();
  const dso = createDsoClient();
  if (dso !== null) {
    try {
      await dso.refresh();
    } catch {
      // Fail closed: cache stays empty and resolveCapability returns null.
    }
  }
  const folderPort = new WindowsFolderBindingAdapter({
    dialog: {
      showOpenDialog: (options) => {
        const dialogOptions: {
          properties: Array<'openDirectory' | 'openFile' | 'multiSelections'>;
          title?: string;
        } = {
          properties: [...options.properties] as Array<
            'openDirectory' | 'openFile' | 'multiSelections'
          >,
        };
        if (options.title !== undefined) dialogOptions.title = options.title;
        return dialog.showOpenDialog(dialogOptions);
      },
    },
  });
  const folders = new FolderManifestService({
    port: folderPort,
    store: { bindings: new Map() },
    nowMs: () => Date.now(),
    resolveCapability: (capabilityGrantId) => dso?.resolveCapability(capabilityGrantId) ?? null,
  });
  const folderWatchers = new FolderWatcherLifecycle({
    folders,
    assertInsideBinding: (bindingRoot, candidatePath) =>
      folderPort.assertPathInsideBinding(bindingRoot, candidatePath),
    createWatcher: (input) => new WindowsFolderWatcherAdapter(input),
    createIntake: ({ bindingId, canonicalPath, manifest }) =>
      new FolderIntakeService({
        detector: new StableFileDetector({
          debounceMs: manifest.stabilityDebounceMs,
          nowMs: () => Date.now(),
        }),
        bindingId,
        bindingRoot: canonicalPath,
        manifest,
        assertInsideBinding: (candidatePath) =>
          folderPort.assertPathInsideBinding(canonicalPath, candidatePath),
        readFingerprint: fingerprintFolderFile,
      }),
    nowMs: () => Date.now(),
  });
  disposeFolderWatchers = () => folderWatchers.dispose();

  if (dso !== null) {
    const refreshTimer = setInterval(() => {
      void dso
        .refresh()
        .then(() => folderWatchers.reconcile())
        .catch(() => folderWatchers.reconcile());
    }, 60_000);
    refreshTimer.unref?.();
    const previousDispose = disposeFolderWatchers;
    disposeFolderWatchers = () => {
      clearInterval(refreshTimer);
      previousDispose?.();
    };
  }

  await createDesktopWindow({
    BrowserWindow: BrowserWindow as unknown as BrowserWindowConstructor,
    beforeLoad: ({ expectedRendererUrl, window }) => {
      activeWindow = window as unknown as BrowserWindow;
      disposeIpc = registerDesktopIpcV1({
        expectedRendererUrl,
        getActiveWindow: () => activeWindow as unknown as DesktopWindowLike,
        ipcMain: ipcMain as unknown as DesktopIpcRegistrationInput['ipcMain'],
        localState,
        sidecar,
        folders,
        folderWatchers,
      });
    },
    electronSession: session.defaultSession as unknown as DesktopSessionLike,
    iconPath,
    preloadPath,
    rendererFilePath,
  });
}

async function startDesktop(): Promise<void> {
  await app.whenReady();
  await openDesktopWindow();

  app.on('activate', () => {
    if (activeWindow === null || activeWindow.isDestroyed()) {
      void openDesktopWindow().catch(() => app.exit(1));
    }
  });
}

app.on('window-all-closed', () => {
  disposeIpc?.();
  disposeFolderWatchers?.();
  app.quit();
});

void startDesktop().catch(() => app.exit(1));
