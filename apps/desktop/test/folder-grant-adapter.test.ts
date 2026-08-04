import { describe, expect, it, vi } from 'vitest';
import { ElectronFolderGrantAdapter } from '../src/main/adapters/electron-folder-grant.adapter.ts';

describe('dogfood folder grant adapter', () => {
  it('returns a bounded summary without exposing the selected path', async () => {
    const adapter = new ElectronFolderGrantAdapter({
      dialog: {
        showOpenDialog: vi.fn(() =>
          Promise.resolve({ canceled: false, filePaths: ['C:\\approved'] }),
        ),
      },
      readdir: vi.fn(() =>
        Promise.resolve([
          { isFile: () => true, isSymbolicLink: () => false },
          { isFile: () => false, isSymbolicLink: () => false },
        ]),
      ),
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });

    await expect(adapter.grantFolder()).resolves.toEqual({
      fileCount: 1,
      lastScanAt: '2026-08-04T00:00:00.000Z',
      status: 'granted',
    });
  });

  it('keeps the grant unavailable when selection is cancelled or scanning fails', async () => {
    const cancelled = new ElectronFolderGrantAdapter({
      dialog: { showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })) },
      readdir: vi.fn(),
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });
    await expect(cancelled.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });

    const unavailable = new ElectronFolderGrantAdapter({
      dialog: { showOpenDialog: vi.fn(() => Promise.reject(new Error('dialog unavailable'))) },
      readdir: vi.fn(),
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });
    await expect(unavailable.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });
  });
});
