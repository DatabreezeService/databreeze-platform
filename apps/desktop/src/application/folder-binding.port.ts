export type FolderSelectionResult =
  | { readonly selectionToken: string }
  | { readonly rejected: 'FOLDER_SELECTION_CANCELLED' | 'FOLDER_SELECTION_DENIED' };

export type FolderResolveResult =
  | { readonly canonicalPath: string }
  | { readonly rejected: 'FOLDER_SELECTION_UNKNOWN' | 'FOLDER_PATH_INVALID' };

export interface FolderBindingPort {
  selectFolder(): Promise<FolderSelectionResult>;
  resolveSelection(selectionToken: string): Promise<FolderResolveResult>;
  assertPathInsideBinding(canonicalRoot: string, candidatePath: string): boolean;
  detectSymlinkEscape(canonicalRoot: string): Promise<boolean>;
}
