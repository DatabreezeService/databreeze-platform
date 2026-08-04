import { describe, expect, it, vi } from 'vitest';
import { ElectronFolderGrantAdapter } from '../src/main/adapters/electron-folder-grant.adapter.ts';

describe('dogfood folder grant adapter', () => {
  it('returns a bounded summary without exposing the selected path', async () => {
    const close = vi.fn(() => Promise.resolve());
    const opendir = vi.fn(() =>
      Promise.resolve({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          yield { isFile: () => true, isSymbolicLink: () => false };
          yield { isFile: () => false, isSymbolicLink: () => false };
        },
        close,
      }),
    );
    const adapter = new ElectronFolderGrantAdapter({
      dialog: {
        showOpenDialog: vi.fn(() =>
          Promise.resolve({ canceled: false, filePaths: ['C:\\approved'] }),
        ),
      },
      opendir,
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });

    await expect(adapter.grantFolder()).resolves.toEqual({
      fileCount: 1,
      lastScanAt: '2026-08-04T00:00:00.000Z',
      status: 'granted',
    });
    expect(opendir).toHaveBeenCalledWith('C:\\approved');
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the grant unavailable when selection is cancelled or scanning fails', async () => {
    const cancelled = new ElectronFolderGrantAdapter({
      dialog: { showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })) },
      opendir: vi.fn(),
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });
    await expect(cancelled.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });

    const unavailable = new ElectronFolderGrantAdapter({
      dialog: { showOpenDialog: vi.fn(() => Promise.reject(new Error('dialog unavailable'))) },
      opendir: vi.fn(),
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });
    await expect(unavailable.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });
  });

  it('stops after the file bound and always closes the directory iterator', async () => {
    const close = vi.fn(() => Promise.resolve());
    let yielded = 0;
    const opendir = vi.fn(() =>
      Promise.resolve({
        async *[Symbol.asyncIterator]() {
          await Promise.resolve();
          for (let index = 0; index < 20_000; index += 1) {
            yielded += 1;
            yield { isFile: () => true, isSymbolicLink: () => false };
          }
        },
        close,
      }),
    );
    const adapter = new ElectronFolderGrantAdapter({
      dialog: {
        showOpenDialog: vi.fn(() =>
          Promise.resolve({ canceled: false, filePaths: ['C:\\approved'] }),
        ),
      },
      opendir,
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });

    await expect(adapter.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });
    expect(yielded).toBe(10_001);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the directory when iteration fails', async () => {
    const close = vi.fn(() => Promise.resolve());
    const opendir = vi.fn(() =>
      Promise.resolve({
        [Symbol.asyncIterator]() {
          return {
            next: () => Promise.reject(new Error('scan failed')),
          };
        },
        close,
      }),
    );
    const adapter = new ElectronFolderGrantAdapter({
      dialog: {
        showOpenDialog: vi.fn(() =>
          Promise.resolve({ canceled: false, filePaths: ['C:\\approved'] }),
        ),
      },
      opendir,
      now: () => new Date('2026-08-04T00:00:00.000Z'),
    });

    await expect(adapter.grantFolder()).resolves.toEqual({
      fileCount: 0,
      lastScanAt: null,
      status: 'not-granted',
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
