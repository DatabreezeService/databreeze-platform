export type SourceClassificationDispositionV1 = 'MATCH' | 'MISPLACED' | 'AMBIGUOUS' | 'UNSUPPORTED';

export interface SourceClassificationAssignmentV1 {
  readonly logicalDatasetId: string;
  readonly intendedFolder: string;
  readonly schemaFingerprint: string;
  readonly purpose: string;
}

export interface SourceClassificationInputV1 {
  readonly relativePath: string;
  readonly extension: string;
  readonly contentFingerprint: string;
  readonly schemaFingerprint: string;
  readonly headers: readonly string[];
  readonly sheetNames: readonly string[];
  readonly previouslyAccepted: readonly SourceClassificationAssignmentV1[];
  readonly folderManifestDatasetIds: readonly string[];
}

export interface SourceClassificationResultV1 {
  readonly disposition: SourceClassificationDispositionV1;
  readonly logicalDatasetId?: string;
  readonly intendedFolder?: string;
  readonly purpose?: string;
  readonly schemaFingerprint: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly sampleDescriptor: string;
}

const SUPPORTED = new Set(['csv', 'xlsx']);

function normalizeRelative(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function parentFolder(relativePath: string): string {
  const normalized = normalizeRelative(relativePath);
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
}

function fileLabel(relativePath: string): string {
  const normalized = normalizeRelative(relativePath);
  const base = normalized.includes('/')
    ? normalized.slice(normalized.lastIndexOf('/') + 1)
    : normalized;
  return base;
}

/** DDA-059: classify a stable Desktop file without treating source strings as authority. */
export function classifyStableFile(
  input: SourceClassificationInputV1,
): SourceClassificationResultV1 {
  const sampleDescriptor = fileLabel(input.relativePath);
  const extension = input.extension.toLowerCase().replace(/^\./, '');
  if (!SUPPORTED.has(extension)) {
    return Object.freeze({
      disposition: 'UNSUPPORTED',
      schemaFingerprint: input.schemaFingerprint,
      confidence: 0,
      reasons: Object.freeze(['UNSUPPORTED_EXTENSION']),
      sampleDescriptor,
    });
  }

  const candidates = input.previouslyAccepted.filter((item) =>
    input.folderManifestDatasetIds.includes(item.logicalDatasetId),
  );
  const schemaMatches = candidates.filter(
    (item) => item.schemaFingerprint === input.schemaFingerprint,
  );

  if (schemaMatches.length === 0) {
    return Object.freeze({
      disposition: 'AMBIGUOUS',
      schemaFingerprint: input.schemaFingerprint,
      confidence: 0.2,
      reasons: Object.freeze(['SCHEMA_MISMATCH']),
      sampleDescriptor,
    });
  }

  if (schemaMatches.length > 1) {
    return Object.freeze({
      disposition: 'AMBIGUOUS',
      schemaFingerprint: input.schemaFingerprint,
      confidence: 0.4,
      reasons: Object.freeze(['MULTIPLE_DATASET_CANDIDATES']),
      sampleDescriptor,
    });
  }

  const match = schemaMatches[0]!;
  const currentFolder = parentFolder(input.relativePath);
  if (currentFolder !== match.intendedFolder) {
    return Object.freeze({
      disposition: 'MISPLACED',
      logicalDatasetId: match.logicalDatasetId,
      intendedFolder: match.intendedFolder,
      purpose: match.purpose,
      schemaFingerprint: input.schemaFingerprint,
      confidence: 0.75,
      reasons: Object.freeze(['FOLDER_MISMATCH']),
      sampleDescriptor,
    });
  }

  return Object.freeze({
    disposition: 'MATCH',
    logicalDatasetId: match.logicalDatasetId,
    intendedFolder: match.intendedFolder,
    purpose: match.purpose,
    schemaFingerprint: input.schemaFingerprint,
    confidence: 0.95,
    reasons: Object.freeze(['SCHEMA_AND_FOLDER_MATCH']),
    sampleDescriptor,
  });
}
