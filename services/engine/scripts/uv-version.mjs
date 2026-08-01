const REQUIRED_UV_VERSION = '0.11.32';

export function isRequiredUvVersion(output) {
  const firstLine = output.trim().split(/\r?\n/u)[0] ?? '';
  const match =
    /^uv ([0-9]+\.[0-9]+\.[0-9]+)(?: \([0-9a-f]{9} \d{4}-\d{2}-\d{2}(?: [A-Za-z0-9_.-]+)?\))?$/u.exec(
      firstLine,
    );
  return match?.[1] === REQUIRED_UV_VERSION;
}

export { REQUIRED_UV_VERSION };
