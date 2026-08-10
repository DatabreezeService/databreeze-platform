import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FolderBindingPort,
  FolderResolveResult,
  FolderSelectionResult,
} from '../../application/folder-binding.port.ts';

export interface WindowsDialogLike {
  showOpenDialog(
    options: Readonly<{
      properties: readonly string[];
      title?: string;
    }>,
  ): Promise<{ readonly canceled: boolean; readonly filePaths: readonly string[] }>;
}

export interface WindowsFolderBindingAdapterInput {
  readonly dialog: WindowsDialogLike;
  readonly resolveRealPath?: (candidate: string) => Promise<string>;
}

export class WindowsFolderBindingAdapter implements FolderBindingPort {
  readonly #dialog: WindowsDialogLike;
  readonly #resolveRealPath: (candidate: string) => Promise<string>;
  readonly #selections = new Map<string, string>();

  constructor(input: WindowsFolderBindingAdapterInput) {
    this.#dialog = input.dialog;
    this.#resolveRealPath = input.resolveRealPath ?? ((candidate) => fs.realpath(candidate));
  }

  async selectFolder(): Promise<FolderSelectionResult> {
    const result = await this.#dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select approved DataBreeze folder',
    });
    if (result.canceled || result.filePaths.length !== 1) {
      return { rejected: 'FOLDER_SELECTION_CANCELLED' };
    }
    const selected = result.filePaths[0];
    if (selected === undefined || selected.trim() === '') {
      return { rejected: 'FOLDER_SELECTION_DENIED' };
    }
    let canonicalPath: string;
    try {
      canonicalPath = path.resolve(await this.#resolveRealPath(selected));
    } catch {
      return { rejected: 'FOLDER_SELECTION_DENIED' };
    }
    const selectionToken = `sel_${createHash('sha256')
      .update(randomBytes(16))
      .digest('hex')
      .slice(0, 24)}`;
    this.#selections.set(selectionToken, canonicalPath);
    return { selectionToken };
  }

  resolveSelection(selectionToken: string): Promise<FolderResolveResult> {
    const canonicalPath = this.#selections.get(selectionToken);
    if (canonicalPath === undefined)
      return Promise.resolve({ rejected: 'FOLDER_SELECTION_UNKNOWN' });
    this.#selections.delete(selectionToken);
    return Promise.resolve({ canonicalPath });
  }

  assertPathInsideBinding(canonicalRoot: string, candidatePath: string): boolean {
    const root = path.resolve(canonicalRoot).replace(/\//g, '\\').toLowerCase();
    const candidate = path.resolve(candidatePath).replace(/\//g, '\\').toLowerCase();
    return candidate === root || candidate.startsWith(`${root}\\`);
  }

  async detectSymlinkEscape(canonicalRoot: string): Promise<boolean> {
    try {
      const real = path.resolve(await this.#resolveRealPath(canonicalRoot));
      const declared = path.resolve(canonicalRoot);
      return real.toLowerCase() !== declared.toLowerCase();
    } catch {
      return true;
    }
  }
}
