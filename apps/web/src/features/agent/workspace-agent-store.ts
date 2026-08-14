import { createAgentStore } from './agent-store.ts';

/**
 * WEB-024/DDA-031: one client-side agent session follows the signed-in user
 * across Dashboard, Analysis, and Data. Server history remains authoritative.
 */
export const workspaceAgentStore = createAgentStore();
