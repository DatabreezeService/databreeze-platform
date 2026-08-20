import { describe, expect, it, vi } from 'vitest';
import { DeviceReadError, listDevices } from '../src/features/devices/device-api.ts';

const organizationId = '00000000-0000-4000-8000-000000000701';
const deviceId = '00000000-0000-4000-8000-000000000702';

describe('device governance transport', () => {
  it('parses the server-owned device inventory without exposing public keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accepted: true,
            value: [
              {
                schemaVersion: 1,
                id: deviceId,
                userId: '00000000-0000-4000-8000-000000000703',
                organizationId,
                platform: 'WINDOWS',
                publicKey: 'secret-public-key',
                keyAlgorithm: 'ED25519',
                status: 'ACTIVE',
                securityEpoch: 2,
                enrolledAt: '2026-08-18T12:00:00.000Z',
                revision: 3,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const devices = await listDevices(organizationId);
    expect(devices).toEqual([
      {
        id: deviceId,
        platform: 'WINDOWS',
        status: 'ACTIVE',
        enrolledAt: '2026-08-18T12:00:00.000Z',
        securityEpoch: 2,
        revision: 3,
      },
    ]);
    expect(JSON.stringify(devices)).not.toContain('secret-public-key');
  });

  it('keeps forbidden organization scope distinct from an empty inventory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(listDevices(organizationId)).rejects.toMatchObject(
      new DeviceReadError('FORBIDDEN'),
    );
  });
});
