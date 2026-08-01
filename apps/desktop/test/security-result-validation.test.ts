import { describe, expect, it, vi } from 'vitest';
import {
  parseDesktopSafeState,
  parseSidecarSafeStatus,
} from '../src/shared/desktop-contract-v1.ts';

const validDesktopState = {
  applicationVersion: '0.0.0',
  dataMode: 'LOCAL',
  deviceState: 'locked',
  enrollmentState: 'not-enrolled',
  locale: 'vi-VN',
};

const validSidecarStatus = {
  engineVersion: null,
  lifecycle: 'not-installed',
  protocolVersion: null,
};

describe('closed Desktop result validation', () => {
  it('rejects boxed strings for every Desktop enum field', () => {
    for (const [field, value] of [
      ['dataMode', 'LOCAL'],
      ['deviceState', 'locked'],
      ['enrollmentState', 'not-enrolled'],
      ['locale', 'vi-VN'],
    ] as const) {
      expect(() =>
        parseDesktopSafeState({ ...validDesktopState, [field]: new String(value) }),
      ).toThrow();
    }
  });

  it('rejects coercion objects for every Desktop enum without calling user code', () => {
    for (const [field, value] of [
      ['dataMode', 'LOCAL'],
      ['deviceState', 'locked'],
      ['enrollmentState', 'not-enrolled'],
      ['locale', 'vi-VN'],
    ] as const) {
      const toString = vi.fn(() => value);
      expect(() =>
        parseDesktopSafeState({ ...validDesktopState, [field]: { toString } }),
      ).toThrow();
      expect(toString).not.toHaveBeenCalled();
    }
  });

  it('rejects boxed and coercible sidecar lifecycle values without calling user code', () => {
    expect(() =>
      parseSidecarSafeStatus({
        ...validSidecarStatus,
        lifecycle: new String('not-installed'),
      }),
    ).toThrow();
    const toString = vi.fn(() => 'not-installed');
    expect(() =>
      parseSidecarSafeStatus({ ...validSidecarStatus, lifecycle: { toString } }),
    ).toThrow();
    expect(toString).not.toHaveBeenCalled();
  });

  it('returns new frozen plain results containing primitive schema values only', () => {
    const desktop = parseDesktopSafeState(validDesktopState);
    const sidecar = parseSidecarSafeStatus(validSidecarStatus);

    expect(desktop).not.toBe(validDesktopState);
    expect(sidecar).not.toBe(validSidecarStatus);
    expect(Object.getPrototypeOf(desktop)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(sidecar)).toBe(Object.prototype);
    expect(Object.isFrozen(desktop)).toBe(true);
    expect(Object.isFrozen(sidecar)).toBe(true);
    for (const value of Object.values(desktop)) expect(typeof value).toBe('string');
    expect(typeof sidecar.lifecycle).toBe('string');
    expect(sidecar.engineVersion).toBeNull();
    expect(sidecar.protocolVersion).toBeNull();
  });
});
