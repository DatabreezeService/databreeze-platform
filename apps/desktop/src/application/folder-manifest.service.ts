import { createHash, randomBytes } from 'node:crypto';
import type { FolderBindingPort } from './folder-binding.port.ts';
import {
  parseFolderManifestPolicy,
  type FolderBindingSafeStatusV1,
  type FolderCreateRequestV1,
  type FolderManifestPolicyV1,
  type FolderManifestUpdateRequestV1,
} from '../shared/folder-binding-contract-v1.ts';

export type FolderServiceErrorCode =
  | 'FOLDER_REQUEST_REJECTED'
  | 'FOLDER_CAPABILITY_EXPIRED'
  | 'FOLDER_CAPABILITY_REVOKED'
  | 'FOLDER_CAPABILITY_WRONG_SCOPE'
  | 'FOLDER_PATH_ESCAPE'
  | 'FOLDER_BINDING_DUPLICATE'
  | 'FOLDER_BINDING_NOT_FOUND'
  | 'FOLDER_MANIFEST_INCOMPLETE'
  | 'FOLDER_MANIFEST_REVISION_CONFLICT'
  | 'FOLDER_SELECTION_UNKNOWN'
  | 'FOLDER_DISABLED';

export type FolderServiceResult<T> =
  | { readonly accepted: true; readonly value: T }
  | { readonly accepted: false; readonly code: FolderServiceErrorCode };

export interface FolderCapabilityRecord {
  readonly state: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly grantId?: string;
  readonly capabilityId?: string;
  readonly revision?: number;
  readonly expiresAtMs?: number;
  readonly allowedActionTypes?: readonly string[];
  readonly authorizationEpoch?: number;
  readonly opaqueLocalHandle?: string;
}

export interface FolderManifestRevision {
  readonly version: number;
  readonly parentVersion: number | null;
  readonly purpose: string;
  readonly supportedProfiles: readonly string[];
  readonly schemaFingerprints: readonly string[];
  readonly groupingRules: readonly string[];
  readonly versionBehavior: FolderManifestPolicyV1['versionBehavior'];
  readonly periodOverlapPolicy: FolderManifestPolicyV1['periodOverlapPolicy'];
  readonly duplicateKeyFields: readonly string[];
  readonly mappingPolicyId: string;
  readonly stabilityDebounceMs: number;
  readonly publicationProjection: FolderManifestPolicyV1['publicationProjection'];
  readonly createdAtMs: number;
  readonly manifestHash: string;
}

export interface FolderBindingRecord {
  readonly bindingId: string;
  readonly capabilityGrantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly canonicalPath: string;
  readonly pathFingerprint: string;
  lifecycle: 'ACTIVE' | 'DISABLED';
  readonly manifests: FolderManifestRevision[];
}

export interface FolderBindingStore {
  readonly bindings: Map<string, FolderBindingRecord>;
}

export interface FolderManifestServiceInput {
  readonly port: FolderBindingPort;
  readonly store: FolderBindingStore;
  readonly nowMs: () => number;
  readonly resolveCapability: (capabilityGrantId: string) => FolderCapabilityRecord | null;
}

function rejected(code: FolderServiceErrorCode): FolderServiceResult<never> {
  return { accepted: false, code };
}

function newOpaqueId(prefix: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(24);
  let body = '';
  for (const byte of bytes) body += alphabet[byte % alphabet.length] ?? '0';
  return `${prefix}${body}`;
}

function fingerprintPath(canonicalPath: string): string {
  return createHash('sha256').update(canonicalPath.toLowerCase()).digest('hex');
}

function hashManifest(manifest: FolderManifestPolicyV1, version: number): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        duplicateKeyFields: manifest.duplicateKeyFields,
        groupingRules: manifest.groupingRules,
        mappingPolicyId: manifest.mappingPolicyId,
        periodOverlapPolicy: manifest.periodOverlapPolicy,
        publicationProjection: manifest.publicationProjection,
        purpose: manifest.purpose,
        schemaFingerprints: manifest.schemaFingerprints,
        stabilityDebounceMs: manifest.stabilityDebounceMs,
        supportedProfiles: manifest.supportedProfiles,
        version,
        versionBehavior: manifest.versionBehavior,
      }),
    )
    .digest('hex');
}

function toRevision(
  manifest: FolderManifestPolicyV1,
  version: number,
  parentVersion: number | null,
  createdAtMs: number,
): FolderManifestRevision {
  return Object.freeze({
    version,
    parentVersion,
    purpose: manifest.purpose,
    supportedProfiles: manifest.supportedProfiles,
    schemaFingerprints: manifest.schemaFingerprints,
    groupingRules: manifest.groupingRules,
    versionBehavior: manifest.versionBehavior,
    periodOverlapPolicy: manifest.periodOverlapPolicy,
    duplicateKeyFields: manifest.duplicateKeyFields,
    mappingPolicyId: manifest.mappingPolicyId,
    stabilityDebounceMs: manifest.stabilityDebounceMs,
    publicationProjection: manifest.publicationProjection,
    createdAtMs,
    manifestHash: hashManifest(manifest, version),
  });
}

function hasHostilePathField(request: object): boolean {
  const keys = Reflect.ownKeys(request);
  return keys.some(
    (key) =>
      typeof key === 'string' &&
      /path|file|directory|root|folderPath|canonical/i.test(key) &&
      key !== 'selectionToken',
  );
}

export class FolderManifestService {
  readonly #port: FolderBindingPort;
  readonly #store: FolderBindingStore;
  readonly #nowMs: () => number;
  readonly #resolveCapability: (capabilityGrantId: string) => FolderCapabilityRecord | null;

  constructor(input: FolderManifestServiceInput) {
    this.#port = input.port;
    this.#store = input.store;
    this.#nowMs = input.nowMs;
    this.#resolveCapability = input.resolveCapability;
  }

  async selectFolder(): Promise<FolderServiceResult<{ selectionToken: string }>> {
    const selected = await this.#port.selectFolder();
    if ('rejected' in selected) return rejected('FOLDER_REQUEST_REJECTED');
    return { accepted: true, value: { selectionToken: selected.selectionToken } };
  }

  async createBinding(
    request: FolderCreateRequestV1,
  ): Promise<FolderServiceResult<FolderBindingSafeStatusV1>> {
    if (hasHostilePathField(request)) return rejected('FOLDER_REQUEST_REJECTED');

    let manifest: FolderManifestPolicyV1;
    try {
      manifest = parseFolderManifestPolicy(request.manifest);
    } catch {
      return rejected('FOLDER_MANIFEST_INCOMPLETE');
    }

    const capability = this.#resolveCapability(request.capabilityGrantId);
    if (capability === null) return rejected('FOLDER_CAPABILITY_WRONG_SCOPE');
    if (capability.state === 'EXPIRED') return rejected('FOLDER_CAPABILITY_EXPIRED');
    if (capability.state === 'REVOKED') return rejected('FOLDER_CAPABILITY_REVOKED');
    if (
      capability.organizationId !== request.organizationId ||
      capability.workspaceId !== request.workspaceId
    ) {
      return rejected('FOLDER_CAPABILITY_WRONG_SCOPE');
    }

    const resolved = await this.#port.resolveSelection(request.selectionToken);
    if ('rejected' in resolved) return rejected('FOLDER_SELECTION_UNKNOWN');
    if (await this.#port.detectSymlinkEscape(resolved.canonicalPath)) {
      return rejected('FOLDER_PATH_ESCAPE');
    }

    const pathFingerprint = fingerprintPath(resolved.canonicalPath);
    for (const binding of this.#store.bindings.values()) {
      if (
        binding.lifecycle === 'ACTIVE' &&
        binding.workspaceId === request.workspaceId &&
        binding.pathFingerprint === pathFingerprint
      ) {
        return rejected('FOLDER_BINDING_DUPLICATE');
      }
    }

    const bindingId = newOpaqueId('01');
    const revision = toRevision(manifest, 1, null, this.#nowMs());
    const record: FolderBindingRecord = {
      bindingId,
      capabilityGrantId: request.capabilityGrantId,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      displayName: request.displayName,
      canonicalPath: resolved.canonicalPath,
      pathFingerprint,
      lifecycle: 'ACTIVE',
      manifests: [revision],
    };
    this.#store.bindings.set(bindingId, record);
    return { accepted: true, value: this.#toSafeStatus(record, 'ACTIVE') };
  }

  readStatus(bindingId: string): Promise<FolderServiceResult<FolderBindingSafeStatusV1>> {
    const binding = this.#store.bindings.get(bindingId);
    if (binding === undefined) return Promise.resolve(rejected('FOLDER_BINDING_NOT_FOUND'));
    const capability = this.#resolveCapability(binding.capabilityGrantId);
    const capabilityState =
      capability === null
        ? 'WRONG_SCOPE'
        : capability.state === 'ACTIVE'
          ? 'ACTIVE'
          : capability.state;
    return Promise.resolve({ accepted: true, value: this.#toSafeStatus(binding, capabilityState) });
  }

  updateManifest(
    request: FolderManifestUpdateRequestV1,
  ): Promise<FolderServiceResult<FolderBindingSafeStatusV1>> {
    const binding = this.#store.bindings.get(request.bindingId);
    if (binding === undefined) return Promise.resolve(rejected('FOLDER_BINDING_NOT_FOUND'));
    if (binding.lifecycle !== 'ACTIVE') return Promise.resolve(rejected('FOLDER_DISABLED'));

    let manifest: FolderManifestPolicyV1;
    try {
      manifest = parseFolderManifestPolicy(request.manifest);
    } catch {
      return Promise.resolve(rejected('FOLDER_MANIFEST_INCOMPLETE'));
    }

    const current = binding.manifests[binding.manifests.length - 1];
    if (current === undefined || current.version !== request.expectedVersion) {
      return Promise.resolve(rejected('FOLDER_MANIFEST_REVISION_CONFLICT'));
    }

    const next = toRevision(manifest, current.version + 1, current.version, this.#nowMs());
    binding.manifests.push(next);
    return Promise.resolve({ accepted: true, value: this.#toSafeStatus(binding, 'ACTIVE') });
  }

  disable(bindingId: string): Promise<FolderServiceResult<FolderBindingSafeStatusV1>> {
    const binding = this.#store.bindings.get(bindingId);
    if (binding === undefined) return Promise.resolve(rejected('FOLDER_BINDING_NOT_FOUND'));
    binding.lifecycle = 'DISABLED';
    return Promise.resolve({ accepted: true, value: this.#toSafeStatus(binding, 'ACTIVE') });
  }

  listSafeStatuses(): readonly FolderBindingSafeStatusV1[] {
    return [...this.#store.bindings.values()].map((binding) =>
      this.#toSafeStatus(binding, 'ACTIVE'),
    );
  }

  manifestHistory(bindingId: string): readonly FolderManifestRevision[] {
    return this.#store.bindings.get(bindingId)?.manifests ?? [];
  }

  getCanonicalPathForTests(bindingId: string): string | null {
    return this.#store.bindings.get(bindingId)?.canonicalPath ?? null;
  }

  watcherConfiguration(bindingId: string): {
    readonly bindingId: string;
    readonly canonicalPath: string;
    readonly manifest: FolderManifestRevision;
  } | null {
    const binding = this.#store.bindings.get(bindingId);
    const manifest = binding?.manifests[binding.manifests.length - 1];
    if (binding === undefined || binding.lifecycle !== 'ACTIVE' || manifest === undefined)
      return null;
    const capability = this.#resolveCapability(binding.capabilityGrantId);
    if (capability === null || capability.state !== 'ACTIVE') return null;
    return Object.freeze({
      bindingId: binding.bindingId,
      canonicalPath: binding.canonicalPath,
      manifest,
    });
  }

  #toSafeStatus(
    binding: FolderBindingRecord,
    capabilityState: FolderBindingSafeStatusV1['capabilityState'],
  ): FolderBindingSafeStatusV1 {
    const current = binding.manifests[binding.manifests.length - 1];
    if (current === undefined) throw new Error('FOLDER_INTERNAL_ERROR');
    return Object.freeze({
      bindingId: binding.bindingId,
      capabilityGrantId: binding.capabilityGrantId,
      capabilityState,
      lifecycle: binding.lifecycle,
      manifestVersion: current.version,
      purpose: current.purpose,
      supportedProfiles: current.supportedProfiles,
    });
  }
}
