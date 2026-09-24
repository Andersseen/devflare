import { isIpLiteral } from './ip';

/**
 * What the Domain Inspector will connect to. Hostnames only: no IP literals
 * (no scanning by address), no ports other than the scheme's default (no port
 * scanning), no credentials, no special-use names. The same check runs on
 * the user's input and on every redirect hop.
 */

/** Special-use and non-public suffixes (RFC 6761, RFC 6762, RFC 8375, …). */
const BLOCKED_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'home.arpa',
  'test',
  'invalid',
  'example',
  'onion',
  'arpa',
];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export type TargetProblem =
  | 'empty'
  | 'unparseable'
  | 'protocol'
  | 'credentials'
  | 'port'
  | 'ip-literal'
  | 'hostname'
  | 'special-use';

export class TargetError extends Error {
  constructor(
    readonly problem: TargetProblem,
    message: string,
  ) {
    super(message);
  }
}

export function checkHostname(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host)) {
    throw new TargetError(
      'ip-literal',
      'Enter a domain name, not an IP address.',
    );
  }
  if (
    BLOCKED_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
  ) {
    throw new TargetError(
      'special-use',
      `"${hostname}" is a special-use name that is not on the public Internet.`,
    );
  }
  const labels = host.split('.');
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => LABEL.test(l))
  ) {
    throw new TargetError(
      'hostname',
      `"${hostname}" is not a valid public domain name.`,
    );
  }
  if (/^\d+$/.test(labels[labels.length - 1])) {
    throw new TargetError(
      'hostname',
      `"${hostname}" is not a valid public domain name.`,
    );
  }
}

/** Validates an absolute URL for fetching (input or redirect hop). */
export function checkFetchUrl(url: URL): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TargetError(
      'protocol',
      `Only http and https are inspected, not ${url.protocol}`,
    );
  }
  if (url.username || url.password) {
    throw new TargetError(
      'credentials',
      'URLs with credentials are not inspected.',
    );
  }
  // WHATWG URL drops a port equal to the scheme default, so any port left is
  // non-default.
  if (url.port !== '') {
    throw new TargetError(
      'port',
      'Only the default ports (80/443) are inspected.',
    );
  }
  checkHostname(url.hostname);
}

/** `example.com`, `https://example.com/path` → the URL to start from. */
export function parseTarget(input: unknown): URL {
  if (typeof input !== 'string' || !input.trim()) {
    throw new TargetError('empty', 'Enter a domain such as example.com.');
  }
  const text = input.trim();
  if (text.length > 2048)
    throw new TargetError('unparseable', 'That input is too long.');

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  let url: URL;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    throw new TargetError('unparseable', 'That is not a domain or URL.');
  }
  checkFetchUrl(url);
  url.hash = '';
  return url;
}
