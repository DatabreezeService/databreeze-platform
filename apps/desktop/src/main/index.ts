import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { FolderIntakeService } from '../application/folder-intake.service.ts';
import { FolderManifestService } from '../application/folder-manifest.service.ts';
import { StableFileDetector } from '../application/stable-file-detector.ts';
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
  if (!filePath.toLowerCase().endsWith('.csv')) return { rejected: 'UNSUPPORTED_PROFILE' as const };
  try {
    const content = await fs.readFile(filePath);
    const header = content.toString('utf8').split(/\r?\n/, 1)[0]?.trim();
    if (header === undefined || header === '') return { rejected: 'MALFORMED_CONTENT' as const };
    return {
      accepted: true as const,
      contentFingerprint: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      schemaFingerprint: createHash('sha256').update(header).digest('hex'),
      profile: 'CSV' as const,
    };
  } catch {
    return { rejected: 'MALFORMED_CONTENT' as const };
  }
}

async function openDesktopWindow(): Promise<void> {
  const localState = new LockedLocalStateAdapter({
    applicationVersion: app.getVersion(),
    locale: 'vi-VN',
  });
  const sidecar = new UnavailableSidecarAdapter();
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
    // Device capability grants remain DSO-owned; until enrollment lands, deny create.
    resolveCapability: () => null,
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
