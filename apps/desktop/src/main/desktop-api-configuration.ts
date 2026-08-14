export interface DesktopApiConfiguration {
  readonly baseUrl: string;
}

type DesktopEnvironment = Readonly<Record<string, string | undefined>>;

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** DSK-008: accept one exact API origin; never inherit credentials, paths, or query authority. */
export function readDesktopApiConfiguration(
  environment: DesktopEnvironment,
): DesktopApiConfiguration | null {
  const rawBaseUrl = environment['DATABREEZE_API_BASE_URL']?.trim();
  if (rawBaseUrl === undefined || rawBaseUrl.length === 0 || rawBaseUrl.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    return null;
  }
  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    return null;
  }
  const secure = url.protocol === 'https:';
  const explicitlyAllowedLoopback =
    url.protocol === 'http:' &&
    isLoopback(url.hostname) &&
    environment['DATABREEZE_DESKTOP_ALLOW_INSECURE_LOOPBACK'] === 'true';
  if (!secure && !explicitlyAllowedLoopback) return null;
  return Object.freeze({ baseUrl: url.origin });
}
