import type {
  WorkbenchCatalogPage,
  WorkbenchOriginalDescriptor,
  WorkbenchSessionSnapshot,
  WorkbenchSyncStatus,
  WorkbenchImportProfile,
} from '../../shared/workbench-contract-v1.ts';

export interface WorkbenchMainPort {
  readSession(): Promise<WorkbenchSessionSnapshot>;
  listCatalogPage(request: { cursor: string | null }): Promise<WorkbenchCatalogPage>;
  readOriginalDescriptor(request: {
    descriptorId: string;
  }): Promise<WorkbenchOriginalDescriptor>;
  decideFolderReview(request: {
    reviewId: string;
    decision: 'approve' | 'reject';
  }): Promise<{ accepted: true }>;
  runAgentTurn(request: { message: string }): Promise<{ accepted: true }>;
  getSyncStatus(): Promise<WorkbenchSyncStatus>;
  importSource(request: { profile: WorkbenchImportProfile }): Promise<{ accepted: true }>;
  signInWithPassword(request: {
    email: string;
    password: string;
  }): Promise<WorkbenchSessionSnapshot>;
  verifyOtp(request: { code: string }): Promise<WorkbenchSessionSnapshot>;
  startGoogleOidc(): Promise<{ accepted: true }>;
}

const emptyCatalog: WorkbenchCatalogPage = Object.freeze({
  folders: Object.freeze([]),
  datasets: Object.freeze([]),
  reviewItems: Object.freeze([]),
  recentAnalyses: Object.freeze([]),
});

const signedOut: WorkbenchSessionSnapshot = Object.freeze({
  signedIn: false,
  accountLabel: null,
  workspaceLabel: null,
});

/** Fail-closed in-memory workbench port used until durable Desktop session wiring lands. */
export function createFailClosedWorkbenchPort(): WorkbenchMainPort {
  return {
    readSession: async () => signedOut,
    listCatalogPage: async () => emptyCatalog,
    readOriginalDescriptor: async () => {
      throw new Error('WORKBENCH_ORIGINAL_UNAVAILABLE');
    },
    decideFolderReview: async () => Object.freeze({ accepted: true as const }),
    runAgentTurn: async () => Object.freeze({ accepted: true as const }),
    getSyncStatus: async () =>
      Object.freeze({
        folderMonitoring: 'unavailable' as const,
        syncQueue: 0,
        engineHealth: 'not-installed' as const,
        pendingReviewCount: 0,
      }),
    importSource: async () => Object.freeze({ accepted: true as const }),
    signInWithPassword: async () => signedOut,
    verifyOtp: async () => signedOut,
    startGoogleOidc: async () => Object.freeze({ accepted: true as const }),
  };
}
