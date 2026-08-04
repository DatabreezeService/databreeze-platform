import { createRequire } from 'node:module';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { ElectronFolderGrantAdapter } from './adapters/electron-folder-grant.adapter.ts';
import { LockedLocalStateAdapter } from './adapters/locked-local-state.adapter.ts';
import { UnavailableSidecarAdapter } from './adapters/unavailable-sidecar.adapter.ts';
import {
  createDesktopWindow,
  type BrowserWindowConstructor,
  type DesktopSessionLike,
  type DesktopWindowLike,
} from './desktop-window.ts';
import { registerDesktopIpcV1, type DesktopIpcRegistrationInput } from './ipc-registry.ts';

const require = createRequire(import.meta.url);
const iconPath = require.resolve(
  '@databreeze/design-tokens/brand/generated/desktop/application.ico',
);
const preloadPath = path.resolve(import.meta.dirname, '../preload/index.cjs');
const rendererFilePath = path.resolve(import.meta.dirname, '../renderer/index.html');

let activeWindow: BrowserWindow | null = null;
let disposeIpc: (() => void) | undefined;

async function openDesktopWindow(): Promise<void> {
  const localState = new LockedLocalStateAdapter({
    applicationVersion: app.getVersion(),
    locale: 'vi-VN',
  });
  const folderGrant = new ElectronFolderGrantAdapter({
    dialog: {
      showOpenDialog: (options) => dialog.showOpenDialog({ properties: [...options.properties] }),
    },
  });
  const sidecar = new UnavailableSidecarAdapter();

  await createDesktopWindow({
    BrowserWindow: BrowserWindow as unknown as BrowserWindowConstructor,
    beforeLoad: ({ expectedRendererUrl, window }) => {
      activeWindow = window as unknown as BrowserWindow;
      disposeIpc = registerDesktopIpcV1({
        expectedRendererUrl,
        getActiveWindow: () => activeWindow as unknown as DesktopWindowLike,
        ipcMain: ipcMain as unknown as DesktopIpcRegistrationInput['ipcMain'],
        folderGrant,
        localState,
        sidecar,
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
  app.quit();
});

void startDesktop().catch(() => app.exit(1));
