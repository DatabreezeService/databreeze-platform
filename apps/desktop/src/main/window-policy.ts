export interface SecureWindowOptionsInput {
  readonly iconPath: string;
  readonly preloadPath: string;
}

export interface SecureWindowOptions {
  readonly backgroundColor: string;
  readonly height: number;
  readonly icon: string;
  readonly minHeight: number;
  readonly minWidth: number;
  readonly show: boolean;
  readonly title: string;
  readonly webPreferences: {
    readonly allowRunningInsecureContent: false;
    readonly contextIsolation: true;
    readonly nodeIntegration: false;
    readonly preload: string;
    readonly sandbox: true;
    readonly webSecurity: true;
    readonly webviewTag: false;
  };
  readonly width: number;
}

export function createSecureWindowOptions({
  iconPath,
  preloadPath,
}: SecureWindowOptionsInput): SecureWindowOptions {
  return {
    backgroundColor: '#ffffff',
    height: 720,
    icon: iconPath,
    minHeight: 600,
    minWidth: 800,
    show: false,
    title: 'DataBreeze',
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
    width: 1080,
  };
}
