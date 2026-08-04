import { opendir as openDirectory } from 'node:fs/promises';

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

interface FolderDirectoryLike extends AsyncIterable<FolderEntryLike> {
  close(): Promise<void>;
}

type OpenDirectory = (folderPath: string) => Promise<FolderDirectoryLike>;

export interface ElectronFolderGrantAdapterInput {
  readonly dialog: FolderDialogLike;
  readonly now?: () => Date;
  readonly opendir?: OpenDirectory;
}

function notGranted(): FolderGrantState {
  return parseFolderGrantState({ fileCount: 0, lastScanAt: null, status: 'not-granted' });
}

/** Selects and audits a local folder while returning no path or file names to the renderer. */
export class ElectronFolderGrantAdapter implements FolderGrantPort {
  readonly #dialog: FolderDialogLike;
  readonly #now: () => Date;
  readonly #opendir: OpenDirectory;

  public constructor({
    dialog,
    now = () => new Date(),
    opendir = openDirectory,
  }: ElectronFolderGrantAdapterInput) {
    this.#dialog = dialog;
    this.#now = now;
    this.#opendir = opendir;
  }

  public async grantFolder(): Promise<FolderGrantState> {
    let directory: FolderDirectoryLike | undefined;
    try {
      const selection = await this.#dialog.showOpenDialog({ properties: ['openDirectory'] });
      const folderPath = selection.filePaths[0];
      if (selection.canceled || folderPath === undefined || folderPath.length === 0)
        return notGranted();
      directory = await this.#opendir(folderPath);
      let fileCount = 0;
      for await (const entry of directory) {
        if (entry.isFile() && !entry.isSymbolicLink()) {
          fileCount += 1;
          if (fileCount > MAX_FOLDER_FILES) return notGranted();
        }
      }
      return parseFolderGrantState({
        fileCount,
        lastScanAt: this.#now().toISOString(),
        status: 'granted',
      });
    } catch {
      return notGranted();
    } finally {
      if (directory !== undefined) {
        try {
          await directory.close();
        } catch {
          // The result remains content-free even when cleanup fails.
        }
      }
    }
  }
}
