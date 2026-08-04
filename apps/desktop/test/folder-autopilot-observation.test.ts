import { describe, expect, it, vi } from 'vitest';
import {
  captureStableObservation,
  fingerprintBytes,
  waitForStableFile,
  type StableFileStat,
} from '../src/features/folder-autopilot/file-observation.ts';

const stableStat: StableFileStat = {
  isFile: true,
  isSymbolicLink: false,
  sizeBytes: 4,
  modifiedAtNs: '10',
};

describe('Folder Autopilot stable local observations', () => {
  it('waits for two identical metadata samples before hashing', async () => {
    const readStat = vi
      .fn()
      .mockResolvedValueOnce({ ...stableStat, sizeBytes: 3 })
      .mockResolvedValue(stableStat);
    const sleep = vi.fn(() => Promise.resolve());

    await expect(waitForStableFile(readStat, { maxAttempts: 4, sleep })).resolves.toEqual(
      stableStat,
    );
    expect(readStat).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('retries transient lock failures and reports a bounded stable result', async () => {
    const readStat = vi
      .fn()
      .mockRejectedValueOnce(new Error('sharing violation'))
      .mockResolvedValue(stableStat);

    await expect(
      waitForStableFile(readStat, { maxAttempts: 4, sleep: () => Promise.resolve() }),
    ).resolves.toEqual(stableStat);
  });

  it('rejects links and non-files before bytes are read', async () => {
    const readStat = vi.fn().mockResolvedValue({
      ...stableStat,
      isSymbolicLink: true,
    });
    await expect(waitForStableFile(readStat)).rejects.toMatchObject({
      code: 'PATH_REPARSE_POINT',
    });
  });

  it('fingerprints bytes and captures a content-free immutable observation', async () => {
    const bytes = new TextEncoder().encode('data');
    expect(fingerprintBytes(bytes)).toBe(
      '3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7',
    );
    const observation = await captureStableObservation({
      observationId: 'obs-001',
      displayName: 'Báo cáo.csv',
      readStat: vi.fn().mockResolvedValue(stableStat),
      readBytes: vi.fn(() => Promise.resolve(bytes)),
      sleep: () => Promise.resolve(),
    });

    expect(observation.sizeBytes).toBe(4);
    expect(observation.contentSha256).toBe(fingerprintBytes(bytes));
    expect(observation.stableExecutionKey).toHaveLength(64);
    expect('path' in observation).toBe(false);
  });

  it('refuses bytes when the file changes while it is being read', async () => {
    const readStat = vi
      .fn()
      .mockResolvedValueOnce(stableStat)
      .mockResolvedValueOnce(stableStat)
      .mockResolvedValue({ ...stableStat, modifiedAtNs: '11' });
    await expect(
      captureStableObservation({
        observationId: 'obs-001',
        displayName: 'report.csv',
        readStat,
        readBytes: () => Promise.resolve(new TextEncoder().encode('data')),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ code: 'FILE_CHANGED_DURING_READ' });
  });

  it('preserves current-scale nanosecond timestamps as decimal strings', async () => {
    const timestamp = '1764891234567890123';
    const observation = await captureStableObservation({
      observationId: 'obs-ns',
      displayName: 'report.csv',
      readStat: vi.fn().mockResolvedValue({ ...stableStat, modifiedAtNs: timestamp }),
      readBytes: () => Promise.resolve(new TextEncoder().encode('data')),
      sleep: () => Promise.resolve(),
    });
    expect(observation.modifiedAtNs).toBe(timestamp);
  });
});
