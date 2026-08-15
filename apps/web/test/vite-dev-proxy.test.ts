import { describe, expect, it } from 'vitest';

import { createLocalDevProxy } from '../vite.config.ts';

describe('local Vite development proxy', () => {
  it('defaults API traffic to the loopback API and covers all API prefixes', () => {
    const proxy = createLocalDevProxy();

    expect(Object.keys(proxy)).toEqual(['/v1', '/v3', '/health']);
    expect(proxy['/v1']).toMatchObject({
      target: 'http://127.0.0.1:3000',
      changeOrigin: false,
    });
    expect(proxy['/v3']).toMatchObject({
      target: 'http://127.0.0.1:3000',
      changeOrigin: false,
    });
    expect(proxy['/health']).toMatchObject({
      target: 'http://127.0.0.1:3000',
      changeOrigin: false,
    });
  });

  it('accepts only explicit loopback HTTP targets', () => {
    expect(createLocalDevProxy('http://localhost:3010')['/v1']?.target).toBe(
      'http://localhost:3010',
    );
    expect(() => createLocalDevProxy('https://api.example.com')).toThrow('loopback HTTP');
    expect(() => createLocalDevProxy('http://192.168.1.20:3000')).toThrow('loopback HTTP');
    expect(() => createLocalDevProxy('http://127.0.0.1:3000/private')).toThrow('loopback HTTP');
  });
});
