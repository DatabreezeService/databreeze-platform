import { createSessionAwareFetchV1 } from '../auth/auth-session.ts';

function apiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_DATABREEZE_API_BASE_URL'];
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.replace(/\/$/u, '')
    : '';
}

export async function acceptWorkspaceInvitation(token: string): Promise<void> {
  if (token.length < 32 || token.length > 512 || /\p{Cc}/u.test(token))
    throw new Error('INVITATION_TOKEN_INVALID');
  const baseUrl = apiBaseUrl();
  const fetcher = createSessionAwareFetchV1({
    apiBaseUrl: baseUrl,
    fetcher: globalThis.fetch.bind(globalThis),
  });
  const response = await fetcher(`${baseUrl}/v1/invitations/accept`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const code =
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as Record<string, unknown>)['code'] === 'string'
        ? String((payload as Record<string, unknown>)['code'])
        : 'INVITATION_ACCEPT_FAILED';
    throw new Error(code);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as Record<string, unknown>)['id'] === undefined
  )
    throw new Error('INVITATION_RESPONSE_INVALID');
}
