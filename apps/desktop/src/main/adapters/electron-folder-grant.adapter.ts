import { readdir as readDirectory } from 'node:fs/promises';

import type { FolderGrantPort } from '../../application/folder-grant.port.ts';
import { parseFolderGrantState, type FolderGrantState } from '../../shared/desktop-contract-v1.ts';

const MAX_FOLDER_FILES = 10_000;

interface FolderDialogLike {
  showOpenDialog(options: {
    readonly properties: readonly ['openDirectory'];
  }): Promise<{ readonly canceled: boolean; readonly filePaths: readonly string[] }>;
}

interface FolderEntryLike {
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

type ReadDirectory = (
  folderPath: string,
  options: { readonly withFileTypes: true },
) => Promise<readonly FolderEntryLike[]>;

export interface ElectronFolderGrantAdapterInput {
  readonly dialog: FolderDialogLike;
  readonly now?: () => Date;
  readonly readdir?: ReadDirectory;
}

function notGranted(): FolderGrantState {
  return parseFolderGrantState({ fileCount: 0, lastScanAt: null, status: 'not-granted' });
}

/** Selects and audits a local folder while returning no path or file names to the renderer. */
export class ElectronFolderGrantAdapter implements FolderGrantPort {
  readonly #dialog: FolderDialogLike;
  readonly #now: () => Date;
  readonly #readdir: ReadDirectory;

  public constructor({
    dialog,
    now = () => new Date(),
    readdir = readDirectory,
  }: ElectronFolderGrantAdapterInput) {
    this.#dialog = dialog;
    this.#now = now;
    this.#readdir = readdir;
  }

  public async grantFolder(): Promise<FolderGrantState> {
    try {
      const selection = await this.#dialog.showOpenDialog({ properties: ['openDirectory'] });
      const folderPath = selection.filePaths[0];
      if (selection.canceled || folderPath === undefined || folderPath.length === 0)
        return notGranted();
      const entries = await this.#readdir(folderPath, { withFileTypes: true });
      const fileCount = entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).length;
      if (fileCount > MAX_FOLDER_FILES) return notGranted();
      return parseFolderGrantState({
        fileCount,
        lastScanAt: this.#now().toISOString(),
        status: 'granted',
      });
    } catch {
      return notGranted();
    }
  }
}
