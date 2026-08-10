export const SECRET_PATTERNS = Object.freeze([
  Object.freeze({
    name: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  }),
  Object.freeze({
    name: 'AWS access key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/u,
  }),
  Object.freeze({
    name: 'GitHub token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/u,
  }),
  Object.freeze({
    name: 'Slack token',
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u,
  }),
  Object.freeze({
    name: 'OpenAI project key',
    pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/u,
  }),
  Object.freeze({
    name: 'OpenAI API key',
    pattern: /\bsk-(?!proj-)[A-Za-z0-9]{20,}\b/u,
  }),
]);

export function scanTextForSecrets(text) {
  const findings = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}
