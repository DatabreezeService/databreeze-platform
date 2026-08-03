import type { ArtifactExportErrorCodeV1 } from '@databreeze/domain/artifact-export/v1';

export type ArtifactExportProblemCodeV1 = ArtifactExportErrorCodeV1 | 'ARTIFACT_NOT_FOUND';

export class ArtifactExportProblemError extends Error {
  public constructor(readonly code: ArtifactExportProblemCodeV1) {
    super(code);
    this.name = 'ArtifactExportProblemError';
  }
}
