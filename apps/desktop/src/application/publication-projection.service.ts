import type { FolderProjectionClass } from '../shared/folder-binding-contract-v1.ts';

const PROJECTION_RANK: Record<FolderProjectionClass, number> = {
  METADATA_ONLY: 0,
  DASHBOARD_AGGREGATES: 1,
  SELECTED_ROWS_COLUMNS: 2,
  EVIDENCE_DERIVATIVES: 3,
  ORIGINAL_CONTENT: 4,
};

export interface WorkspaceProjectionPolicy {
  readonly maxProjectionClass: FolderProjectionClass;
  readonly allowedFields: readonly string[];
  readonly allowOriginalContent: boolean;
}

export interface ProjectionDraft {
  readonly class: FolderProjectionClass;
  readonly fieldAllowlist: readonly string[];
  readonly rowCount: number;
  readonly byteCount: number;
  readonly destination: 'CLOUD_WORKSPACE_PROJECTION';
  readonly evidenceConsequences: readonly string[];
  readonly dataMode: 'HYBRID' | 'LOCAL' | 'CLOUD';
  readonly version: number;
}

export interface ProjectionPreview extends ProjectionDraft {
  readonly effectiveDataMode: 'HYBRID' | 'LOCAL' | 'CLOUD';
}

export type ProjectionServiceResult<T> =
  | { readonly accepted: true; readonly value: T }
  | {
      readonly accepted: false;
      readonly code:
        | 'PROJECTION_POLICY_BROADENING'
        | 'PROJECTION_FIELD_NOT_ALLOWED'
        | 'PROJECTION_VERSION_REVIEW_REQUIRED'
        | 'PROJECTION_PREVIEW_INCOMPLETE';
    };

export class PublicationProjectionService {
  readonly #workspacePolicy: WorkspaceProjectionPolicy;
  #approvedVersion: number | null = null;
  #approvedClass: FolderProjectionClass | null = null;

  constructor(input: { readonly workspacePolicy: WorkspaceProjectionPolicy }) {
    this.#workspacePolicy = input.workspacePolicy;
  }

  preview(draft: ProjectionDraft): ProjectionServiceResult<ProjectionPreview> {
    if (
      !Number.isSafeInteger(draft.rowCount) ||
      draft.rowCount < 0 ||
      !Number.isSafeInteger(draft.byteCount) ||
      draft.byteCount < 0 ||
      draft.evidenceConsequences.length === 0 ||
      draft.destination !== 'CLOUD_WORKSPACE_PROJECTION' ||
      !Number.isSafeInteger(draft.version) ||
      draft.version < 1
    ) {
      return { accepted: false, code: 'PROJECTION_PREVIEW_INCOMPLETE' };
    }

    if (draft.class === 'ORIGINAL_CONTENT' && !this.#workspacePolicy.allowOriginalContent) {
      return { accepted: false, code: 'PROJECTION_POLICY_BROADENING' };
    }

    if (PROJECTION_RANK[draft.class] > PROJECTION_RANK[this.#workspacePolicy.maxProjectionClass]) {
      return { accepted: false, code: 'PROJECTION_POLICY_BROADENING' };
    }

    if (draft.fieldAllowlist.some((field) => !this.#workspacePolicy.allowedFields.includes(field))) {
      return { accepted: false, code: 'PROJECTION_FIELD_NOT_ALLOWED' };
    }

    return {
      accepted: true,
      value: Object.freeze({
        ...draft,
        fieldAllowlist: Object.freeze([...draft.fieldAllowlist]),
        evidenceConsequences: Object.freeze([...draft.evidenceConsequences]),
        effectiveDataMode: draft.dataMode,
      }),
    };
  }

  approve(draft: ProjectionDraft): ProjectionServiceResult<ProjectionPreview> {
    const previewed = this.preview(draft);
    if (!previewed.accepted) return previewed;

    if (
      this.#approvedClass !== null &&
      this.#approvedVersion !== null &&
      draft.class !== this.#approvedClass &&
      draft.version <= this.#approvedVersion
    ) {
      return { accepted: false, code: 'PROJECTION_VERSION_REVIEW_REQUIRED' };
    }

    this.#approvedVersion = draft.version;
    this.#approvedClass = draft.class;
    return previewed;
  }
}
