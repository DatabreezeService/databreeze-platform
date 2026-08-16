const SIDEBAR_COMPACT_KEY = 'databreeze.sidebar.compact.v1';

/** WEB-013: stores presentation only; never authority, tenant, or resource identity. */
export function readSidebarCompactPreference(): boolean | undefined {
  try {
    const value = globalThis.localStorage?.getItem(SIDEBAR_COMPACT_KEY);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  } catch {
    return undefined;
  }
}

/** WEB-013: device-local, bounded and content-free preference. */
export function writeSidebarCompactPreference(compact: boolean): void {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_COMPACT_KEY, String(compact));
  } catch {
    // A blocked storage provider must not make navigation unavailable.
  }
}
