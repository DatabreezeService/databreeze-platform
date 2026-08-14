import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProtectedDesktopSession,
  ProtectedDesktopSessionStore,
} from './api-workbench.adapter.ts';

interface NativeEncryptionPort {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ElectronProtectedSessionStoreInput {
  readonly filePath: string;
  readonly encryption: NativeEncryptionPort;
}

const MAX_CIPHERTEXT_BYTES = 32 * 1024;

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function boundedNullableLabel(value: unknown): string | null | undefined {
  if (value === null) return null;
  return boundedString(value, 128) ?? undefined;
}

function parseSession(value: unknown): ProtectedDesktopSession | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'accessExpiresAt',
    'accessToken',
    'accountLabel',
    'organizationId',
    'refreshToken',
    'sessionId',
    'userId',
    'workspaceId',
    'workspaceLabel',
  ];
  const actualKeys = Object.keys(record).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }
  const sessionId = boundedString(record['sessionId'], 128);
  const userId = boundedString(record['userId'], 128);
  const organizationId = boundedString(record['organizationId'], 128);
  const workspaceId = boundedString(record['workspaceId'], 128);
  const accessToken = boundedString(record['accessToken'], 4096);
  const refreshToken = boundedString(record['refreshToken'], 4096);
  const accessExpiresAt = boundedString(record['accessExpiresAt'], 64);
  const accountLabel = boundedNullableLabel(record['accountLabel']);
  const workspaceLabel = boundedNullableLabel(record['workspaceLabel']);
  if (
    sessionId === null ||
    userId === null ||
    organizationId === null ||
    workspaceId === null ||
    accessToken === null ||
    refreshToken === null ||
    accessExpiresAt === null ||
    !Number.isFinite(Date.parse(accessExpiresAt)) ||
    accountLabel === undefined ||
    workspaceLabel === undefined
  ) {
    return null;
  }
  return Object.freeze({
    sessionId,
    userId,
    organizationId,
    workspaceId,
    accessToken,
    refreshToken,
    accessExpiresAt,
    accountLabel,
    workspaceLabel,
  });
}

/**
 * Main-process-only DPAPI boundary. Electron `safeStorage` supplies the native encryption port;
 * the renderer receives only the redacted WorkbenchSessionSnapshot.
 */
export class ElectronProtectedSessionStore implements ProtectedDesktopSessionStore {
  readonly #filePath: string;
  readonly #encryption: NativeEncryptionPort;

  constructor(input: ElectronProtectedSessionStoreInput) {
    this.#filePath = input.filePath;
    this.#encryption = input.encryption;
  }

  async load(): Promise<ProtectedDesktopSession | null> {
    if (!this.#encryption.isEncryptionAvailable()) return null;
    try {
      const encrypted = await readFile(this.#filePath);
      if (encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) return null;
      const decrypted = this.#encryption.decryptString(encrypted);
      return parseSession(JSON.parse(decrypted) as unknown);
    } catch {
      return null;
    }
  }

  async save(value: ProtectedDesktopSession): Promise<void> {
    if (!this.#encryption.isEncryptionAvailable()) {
      throw new Error('PROTECTED_SESSION_UNAVAILABLE');
    }
    const validated = parseSession(value);
    if (validated === null) throw new Error('PROTECTED_SESSION_INVALID');
    const encrypted = this.#encryption.encryptString(JSON.stringify(validated));
    if (encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) {
      throw new Error('PROTECTED_SESSION_INVALID');
    }
    const parent = path.dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`;
    await mkdir(parent, { recursive: true });
    try {
      await writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
      await rm(this.#filePath, { force: true });
      await rename(temporaryPath, this.#filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async clear(): Promise<void> {
    await rm(this.#filePath, { force: true });
  }
}
