import type { DesktopBridgeV1 } from '../shared/desktop-contract-v1.ts';

declare global {
  interface Window {
    readonly databreezeDesktop: DesktopBridgeV1;
  }
}

export {};
