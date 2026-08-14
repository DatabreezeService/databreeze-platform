export type WorkspaceAudienceV1 =
  | 'OWNER'
  | 'WORKSPACE_VIEWERS'
  | 'PROJECT_VIEWERS'
  | 'PUBLIC'
  | 'ANONYMOUS'
  | 'EXTERNAL_GUEST'
  | 'SHARED_LINK';

const ALLOWED = new Set<WorkspaceAudienceV1>(['OWNER', 'WORKSPACE_VIEWERS', 'PROJECT_VIEWERS']);

/** DDA-058: first production sharing surface is workspace-member-only. */
export function assertWorkspaceOnlyAudienceV1(
  audience: string,
):
  | { readonly accepted: true; readonly value: WorkspaceAudienceV1 }
  | { readonly accepted: false; readonly code: 'PROHIBITED_AUDIENCE' } {
  if (!ALLOWED.has(audience as WorkspaceAudienceV1)) {
    return Object.freeze({ accepted: false, code: 'PROHIBITED_AUDIENCE' });
  }
  return Object.freeze({ accepted: true, value: audience as WorkspaceAudienceV1 });
}
