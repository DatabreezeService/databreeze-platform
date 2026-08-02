const REQUIRED_UV_VERSION = '0.11.32';

export function isRequiredUvVersion(output) {
  const firstLine = output.trim().split(/\r?\n/u)[0] ?? '';
  const match =
    /^uv ([0-9]+\.[0-9]+\.[0-9]+)(?: \([^()\r\n]{1,160}\))?$/u.exec(firstLine);
  return match?.[1] === REQUIRED_UV_VERSION;
}

export { REQUIRED_UV_VERSION };
