import { contextBridge, ipcRenderer } from 'electron';
import { createDesktopBridgeV1 } from './bridge-v1.ts';
import { DESKTOP_BRIDGE_GLOBAL } from '../shared/desktop-contract-v1.ts';

const bridge = createDesktopBridgeV1((channel, payload) =>
  payload === undefined
    ? (ipcRenderer.invoke(channel) as Promise<unknown>)
    : (ipcRenderer.invoke(channel, payload) as Promise<unknown>),
);
contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_GLOBAL, bridge);
