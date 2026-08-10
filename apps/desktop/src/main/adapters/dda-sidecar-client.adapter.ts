import { createHmac, randomBytes } from 'node:crypto';
import type { SidecarLifecyclePort } from '../../application/sidecar-lifecycle.port.ts';
import {
  parseSidecarSafeStatus,
  type SidecarSafeStatus,
} from '../../shared/desktop-contract-v1.ts';

/** Reviewed pin for `dda_folder_intake.py` (must match engine digest registry). */
export const DDA_FOLDER_INTAKE_HANDLER_DIGEST =
  'sha256:8b497ed6731a1eb9f6ad379f08e11b209d87472b437bc16e0fd4d1a8ac3d795b';

export interface SidecarRpcFrame {
  readonly jsonrpc: '2.0';
  readonly id: string;
  readonly method: 'engine.execute';
  readonly params: Readonly<Record<string, unknown>>;
}

export interface SidecarTransport {
  execute(frame: SidecarRpcFrame): Promise<unknown>;
}

export type FolderIntakeJobInput = {
  readonly capabilityGrantId: string;
  readonly opaqueInputHandle: string;
  readonly relativePath: string;
  readonly profile: 'CSV' | 'XLSX';
  readonly schemaFingerprint: string;
  readonly contentFingerprint: string;
  readonly pinnedSchemaFingerprints: readonly string[];
  readonly supportedProfiles: readonly string[];
  readonly sizeBytes: number;
  readonly handlerDigestOverride?: string;
};

export type SidecarJobResult =
  | {
      readonly accepted: true;
      readonly disposition: 'ADMITTED' | 'QUARANTINE';
      readonly profile?: 'CSV' | 'XLSX';
      readonly contentFingerprint?: string;
      readonly reason?: string;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'HANDLER_DIGEST_MISMATCH'
        | 'JOB_SIGNATURE_INVALID'
        | 'SIDECAR_UNAVAILABLE'
        | 'JOB_REJECTED';
    };

export interface DdaSidecarClientInput {
  readonly transport: SidecarTransport;
  readonly controlPlaneKeyId: string;
  readonly controlPlaneKey: string;
  readonly pinnedDigests: Readonly<Record<string, string>>;
  readonly engineVersion: string;
  readonly protocolVersion: string;
  readonly nowMs?: () => number;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

export class DdaSidecarClientAdapter implements SidecarLifecyclePort {
  readonly #transport: SidecarTransport;
  readonly #controlPlaneKeyId: string;
  readonly #controlPlaneKey: Buffer;
  readonly #pinnedDigests: Readonly<Record<string, string>>;
  readonly #engineVersion: string;
  readonly #protocolVersion: string;
  readonly #nowMs: () => number;

  constructor(input: DdaSidecarClientInput) {
    this.#transport = input.transport;
    this.#controlPlaneKeyId = input.controlPlaneKeyId;
    this.#controlPlaneKey = Buffer.from(input.controlPlaneKey, 'hex');
    this.#pinnedDigests = Object.freeze({ ...input.pinnedDigests });
    this.#engineVersion = input.engineVersion;
    this.#protocolVersion = input.protocolVersion;
    this.#nowMs = input.nowMs ?? (() => Date.now());
  }

  getStatus(): Promise<SidecarSafeStatus> {
    return Promise.resolve(
      parseSidecarSafeStatus({
        engineVersion: this.#engineVersion,
        lifecycle: 'ready',
        protocolVersion: this.#protocolVersion,
      }),
    );
  }

  async executeFolderIntake(input: FolderIntakeJobInput): Promise<SidecarJobResult> {
    const pinned = this.#pinnedDigests['dda.folder.intake'];
    const requestedDigest = input.handlerDigestOverride ?? pinned;
    if (pinned === undefined || requestedDigest !== pinned) {
      return { accepted: false, code: 'HANDLER_DIGEST_MISMATCH' };
    }

    const nowMs = this.#nowMs();
    const unsigned = Object.freeze({
      schemaVersion: 1,
      jobId: opaqueId('01'),
      attemptId: opaqueId('01'),
      action: Object.freeze({
        type: 'dda.folder.intake',
        version: '1.0.0',
        handlerDigest: requestedDigest,
      }),
      capabilityGrantIds: Object.freeze([input.capabilityGrantId]),
      inputRefs: Object.freeze([{ handleId: input.opaqueInputHandle }]),
      parameters: Object.freeze({
        relativePath: input.relativePath.replace(/\\/gu, '/'),
        profile: input.profile,
        schemaFingerprint: input.schemaFingerprint,
        contentFingerprint: input.contentFingerprint,
        pinnedSchemaFingerprints: [...input.pinnedSchemaFingerprints],
        supportedProfiles: [...input.supportedProfiles],
        sizeBytes: input.sizeBytes,
      }),
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + 60_000,
      nonce: randomBytes(16).toString('hex'),
      controlPlaneKeyId: this.#controlPlaneKeyId,
    });
    const signature = createHmac('sha256', this.#controlPlaneKey)
      .update(canonicalJson(unsigned))
      .digest('hex');

    const frame: SidecarRpcFrame = {
      jsonrpc: '2.0',
      id: unsigned.jobId,
      method: 'engine.execute',
      params: Object.freeze({ ...unsigned, signature }),
    };

    let response: unknown;
    try {
      response = await this.#transport.execute(frame);
    } catch {
      return { accepted: false, code: 'SIDECAR_UNAVAILABLE' };
    }

    const body = asRecord(response);
    if (body === null) return { accepted: false, code: 'JOB_REJECTED' };
    if (body['error'] !== undefined) return { accepted: false, code: 'JOB_REJECTED' };

    const result = asRecord(body['result']);
    if (result === null) return { accepted: false, code: 'JOB_REJECTED' };
    const returnedDigest =
      typeof result['handlerDigest'] === 'string' ? result['handlerDigest'] : requestedDigest;
    if (returnedDigest !== pinned) {
      return { accepted: false, code: 'HANDLER_DIGEST_MISMATCH' };
    }

    const output = asRecord(result['output']);
    if (output === null) return { accepted: false, code: 'JOB_REJECTED' };
    const disposition = output['disposition'];
    if (disposition !== 'ADMITTED' && disposition !== 'QUARANTINE') {
      return { accepted: false, code: 'JOB_REJECTED' };
    }

    const profile = output['profile'];
    const contentFingerprint = output['contentFingerprint'];
    const reason = output['reason'];
    return {
      accepted: true,
      disposition,
      ...(typeof profile === 'string' && (profile === 'CSV' || profile === 'XLSX')
        ? { profile }
        : {}),
      ...(typeof contentFingerprint === 'string' ? { contentFingerprint } : {}),
      ...(typeof reason === 'string' ? { reason } : {}),
    };
  }
}

function opaqueId(prefix: string): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(24);
  let body = '';
  for (const byte of bytes) body += alphabet[byte % alphabet.length] ?? '0';
  return `${prefix}${body}`;
}
