/**
 * Spots values in pasted text that look like credentials, so a tool can say
 * "this input contains a bearer token" — and remind the user it stays in the
 * tab. Detection only: it never rewrites or redacts the input, and it is a
 * hint, not a data-loss-prevention system. Patterns are well-known public
 * formats; a miss is expected, a false alarm is harmless.
 */

export interface SecretHint {
  kind: string;
  /** A masked preview: the first characters and the length, never the value. */
  preview: string;
}

const PATTERNS: { kind: string; pattern: RegExp }[] = [
  {
    kind: 'Authorization header',
    pattern:
      /authorization\s*[:=]\s*["']?((?:bearer|basic|token)\s+[^\s"',;]+)/gi,
  },
  { kind: 'JWT', pattern: /\b(eyJ[\w-]{5,}\.eyJ[\w-]{5,}\.[\w-]*)/g },
  {
    kind: 'Client secret',
    pattern: /client[_-]?secret["']?\s*[:=]\s*["']?([^\s"'&,;]{6,})/gi,
  },
  {
    kind: 'API key / token',
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)["']?\s*[:=]\s*["']?([^\s"'&,;]{8,})/gi,
  },
  { kind: 'Cookie', pattern: /\b(?:cookie|set-cookie)\s*:\s*([^\n]+)/gi },
  {
    kind: 'Cookie (curl -b)',
    pattern: /(?:^|\s)(?:-b|--cookie)\s+(['"]?[^\s'"]+=[^\s'"]+)/g,
  },
  { kind: 'AWS access key', pattern: /\b(AKIA[0-9A-Z]{16})\b/g },
  { kind: 'GitHub token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/g },
  {
    kind: 'Stripe secret key',
    pattern: /\b(sk_(?:live|test)_[A-Za-z0-9]{16,})\b/g,
  },
  { kind: 'Private key', pattern: /(-----BEGIN [A-Z ]*PRIVATE KEY-----)/g },
];

export function maskSecret(value: string): string {
  const visible = value.slice(0, Math.min(4, Math.floor(value.length / 4)));
  return `${visible}… (${value.length} chars)`;
}

export function findSecretHints(text: string): SecretHint[] {
  const hints: SecretHint[] = [];
  const seen = new Set<string>();

  for (const { kind, pattern } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? match[0]).trim();
      const key = `${kind}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push({ kind, preview: maskSecret(value) });
    }
  }
  return hints;
}
