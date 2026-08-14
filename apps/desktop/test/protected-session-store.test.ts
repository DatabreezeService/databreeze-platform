import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ElectronProtectedSessionStore } from '../src/main/adapters/electron-protected-session-store.adapter.ts';

const temporaryDirectories: string[] = [];

function xorBytes(value: Uint8Array): Buffer {
  const result = Buffer.alloc(value.byteLength);
  for (let index = 0; index < value.byteLength; index += 1) {
    result[index] = (value[index] ?? 0) ^ 0x5a;
  }
  return result;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Desktop protected session storage (IAM-005, DSK-008)', () => {
  it('persists only encrypted native bytes and restores a validated session', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'databreeze-session-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'session.bin');
    const store = new ElectronProtectedSessionStore({
      filePath,
      encryption: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => xorBytes(Buffer.from(value, 'utf8')),
        decryptString: (value) => xorBytes(value).toString('utf8'),
      },
    });
    const session = {
      sessionId: 'session-1',
      userId: 'user-1',
      organizationId: 'organization-1',
      workspaceId: 'workspace-1',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      accessExpiresAt: '2030-01-01T00:00:00.000Z',
      accountLabel: 'owner@example.test',
      workspaceLabel: 'Cua hang mot',
    } as const;

    await store.save(session);

    const bytes = await readFile(filePath);
    expect(bytes.toString('utf8')).not.toContain('access-secret');
    await expect(store.load()).resolves.toEqual(session);
  });

  it('fails closed when native encryption is unavailable or ciphertext is invalid', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'databreeze-session-'));
    temporaryDirectories.push(directory);
    const store = new ElectronProtectedSessionStore({
      filePath: path.join(directory, 'session.bin'),
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => '{"accessToken":"forged"}',
      },
    });

    await expect(
      store.save({
        sessionId: 'session-1',
        userId: 'user-1',
        organizationId: 'organization-1',
        workspaceId: 'workspace-1',
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        accessExpiresAt: '2030-01-01T00:00:00.000Z',
        accountLabel: null,
        workspaceLabel: null,
      }),
    ).rejects.toThrow('PROTECTED_SESSION_UNAVAILABLE');
    await expect(store.load()).resolves.toBeNull();
  });
});
