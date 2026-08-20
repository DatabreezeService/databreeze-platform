import { createAgentStore } from './agent-store.ts';

/**
 * WEB-024/DDA-031: one client-side agent session follows the signed-in user
 * across Dashboard, Analysis, and Data. It intentionally starts empty: server
 * history is authoritative and the client must never display invented records.
 */
export const workspaceAgentStore = createAgentStore();
