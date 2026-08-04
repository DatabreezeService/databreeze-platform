import { describe, expect, it } from 'vitest';
import {
  PathContainmentError,
  canonicalizeWindowsPath,
  createPathContainmentGuard,
} from '../src/features/folder-autopilot/path-containment.ts';

describe('Folder Autopilot path containment', () => {
  it('canonicalizes case and separators while preserving the root boundary', () => {
    expect(canonicalizeWindowsPath('C:\\Approved\\')).toBe('C:\\Approved');
    expect(() => canonicalizeWindowsPath('Approved\\relative')).toThrow('INVALID_LOCAL_PATH');

    const guard = createPathContainmentGuard({
      canonicalRoot: 'C:\\Approved',
      realpath: (value) => value,
    });

    expect(guard.assertContained('c:\\APPROVED\\Invoices\\01.csv')).toBe(
      'c:\\APPROVED\\Invoices\\01.csv',
    );
    expect(() => guard.assertContained('C:\\Approved-neighbor\\01.csv')).toThrow(
      'PATH_OUTSIDE_AUTHORIZATION',
    );
  });

  it('rejects dot traversal after canonicalization', () => {
    const guard = createPathContainmentGuard({
      canonicalRoot: 'C:\\Approved',
      realpath: (value) => value,
    });

    expect(() => guard.assertContained('C:\\Approved\\..\\Secrets\\payroll.csv')).toThrow(
      'PATH_OUTSIDE_AUTHORIZATION',
    );
  });

  it('rejects a symlink or junction that resolves outside the authorized root', () => {
    const guard = createPathContainmentGuard({
      canonicalRoot: 'C:\\Approved',
      realpath: (value) =>
        value.toLowerCase().includes('linked') ? 'C:\\Secrets\\payroll.csv' : value,
    });

    expect(() => guard.assertContained('C:\\Approved\\linked\\payroll.csv')).toThrow(
      'PATH_OUTSIDE_AUTHORIZATION',
    );
  });

  it('rejects reparse points before local access under the strict policy', () => {
    const guard = createPathContainmentGuard({
      canonicalRoot: 'C:\\Approved',
      realpath: (value) => value,
      isReparsePoint: (value) => value.toLowerCase().includes('junction'),
      reparsePointPolicy: 'REJECT',
    });

    expect(() => guard.assertContained('C:\\Approved\\junction\\file.csv')).toThrow(
      'PATH_REPARSE_POINT',
    );
  });

  it('exposes only a content-free relative name after containment succeeds', () => {
    const guard = createPathContainmentGuard({
      canonicalRoot: 'C:\\Approved',
      realpath: (value) => value,
    });

    expect(guard.relativeName('C:\\Approved\\Invoices\\01.csv')).toBe('Invoices\\01.csv');
    expect(() => guard.relativeName('C:\\Other\\01.csv')).toThrow(PathContainmentError);
  });
});
