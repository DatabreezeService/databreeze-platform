import { pathToFileURL } from 'node:url';
import { installNavigationPolicy } from './navigation-policy.ts';
import { createSecureWindowOptions, type SecureWindowOptions } from './window-policy.ts';

export interface DesktopWindowLike {
  readonly webContents: {
    readonly mainFrame: { readonly url: string };
    on(event: string, listener: (event: { preventDefault(): void }, url?: string) => void): unknown;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  };
  isDestroyed(): boolean;
  loadFile(filePath: string): Promise<unknown>;
  once(event: 'ready-to-show', handler: () => void): void;
  show(): void;
}

export interface BrowserWindowConstructor {
  new (options: SecureWindowOptions): DesktopWindowLike;
}

export interface DesktopSessionLike {
  setPermissionCheckHandler(handler: () => boolean): void;
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
      details: unknown,
    ) => void,
  ): void;
}

export interface CreateDesktopWindowInput {
  readonly BrowserWindow: BrowserWindowConstructor;
  readonly beforeLoad?: (result: DesktopWindowResult) => void;
  readonly electronSession: DesktopSessionLike;
  readonly iconPath: string;
  readonly preloadPath: string;
  readonly rendererFilePath: string;
}

export interface DesktopWindowResult {
  readonly expectedRendererUrl: string;
  readonly window: DesktopWindowLike;
}

export async function createDesktopWindow({
  BrowserWindow,
  beforeLoad,
  electronSession,
  iconPath,
  preloadPath,
  rendererFilePath,
}: CreateDesktopWindowInput): Promise<DesktopWindowResult> {
  const expectedRendererUrl = pathToFileURL(rendererFilePath).href;
  const window = new BrowserWindow(createSecureWindowOptions({ iconPath, preloadPath }));
  installNavigationPolicy({
    electronSession,
    expectedRendererUrl,
    webContents: window.webContents,
  });
  window.once('ready-to-show', () => window.show());
  const result = Object.freeze({ expectedRendererUrl, window });
  beforeLoad?.(result);
  await window.loadFile(rendererFilePath);
  return result;
}
