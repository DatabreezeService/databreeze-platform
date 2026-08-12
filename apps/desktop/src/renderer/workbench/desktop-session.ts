import type { WorkbenchSessionSnapshot } from '../../shared/workbench-contract-v1.ts';
import { parseWorkbenchSessionSnapshot } from '../../shared/workbench-contract-v1.ts';

export function createEmptyDesktopSession(): WorkbenchSessionSnapshot {
  return Object.freeze({
    signedIn: false,
    accountLabel: null,
    workspaceLabel: null,
  });
}

export function restoreDesktopSessionSnapshot(
  value: unknown,
): WorkbenchSessionSnapshot {
  return parseWorkbenchSessionSnapshot(value);
}
