interface PreventableEvent {
  preventDefault(): void;
}

interface NavigationWebContents {
  on(event: string, listener: (event: PreventableEvent, url?: string) => void): unknown;
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
}

interface NavigationSession {
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

export interface NavigationPolicyInput {
  readonly electronSession: NavigationSession;
  readonly expectedRendererUrl: string;
  readonly webContents: NavigationWebContents;
}

export function installNavigationPolicy({
  electronSession,
  expectedRendererUrl,
  webContents,
}: NavigationPolicyInput): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const preventForeignLocation = (event: PreventableEvent, url?: string) => {
    if (url !== expectedRendererUrl) event.preventDefault();
  };
  webContents.on('will-navigate', preventForeignLocation);
  webContents.on('will-redirect', preventForeignLocation);
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  electronSession.setPermissionCheckHandler(() => false);
  electronSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
}
