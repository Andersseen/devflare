/**
 * HTTP response-header diagnostics, shared by two tools:
 *
 *   Security Headers Inspector  — headers the user pasted (browser only)
 *   Domain Inspector            — headers the server fetched
 *
 * Plain functions, no Angular and no DOM, so the Worker imports the same rules
 * the page runs. There is deliberately no score: whether a missing header
 * matters depends on what the response is (an HTML page, an API, an image),
 * so each finding says what the header does and what was observed, and the
 * reader decides. Every rule here is checkable from the headers alone;
 * nothing claims a site is "secure" or "insecure".
 */

export type FindingStatus = 'present' | 'missing' | 'weak' | 'info';

export interface HeaderFinding {
  /** Stable id, e.g. `csp.unsafe-inline`, for tests and UI keys. */
  id: string;
  /** The header this is about, in its canonical spelling. */
  header: string;
  status: FindingStatus;
  title: string;
  detail: string;
  /** The observed value, when there is one. */
  evidence?: string;
}

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface ParsedHeaders {
  headers: HeaderEntry[];
  /** e.g. `HTTP/2 200` when a status line was pasted. */
  statusLine?: string;
  /** Lines that were neither a header nor a status line. */
  ignoredLines: string[];
}

export interface HeaderAnalysis {
  findings: HeaderFinding[];
  counts: Record<FindingStatus, number>;
}

export interface AnalyzeOptions {
  /** Whether the response came over HTTPS (HSTS is ignored over HTTP). Unknown
   * when the headers were pasted. */
  https?: boolean;
}

/**
 * Parses a pasted header block: `curl -I` output, a browser's "copy response
 * headers", or plain `name: value` lines. Tolerates a status line, CRLF, blank
 * lines and obsolete line folding (a continuation line starting with
 * whitespace).
 */
export function parseRawHeaders(text: string): ParsedHeaders {
  const headers: HeaderEntry[] = [];
  const ignoredLines: string[] = [];
  let statusLine: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    if (/^\s/.test(rawLine) && headers.length > 0) {
      const last = headers[headers.length - 1];
      last.value = `${last.value} ${rawLine.trim()}`;
      continue;
    }

    const line = rawLine.trim();
    if (/^HTTP\/\d(\.\d)?\s+\d{3}/i.test(line)) {
      // A redirect chain pasted from `curl -IL` has several responses; only
      // the last one is analysed.
      statusLine = line;
      headers.length = 0;
      continue;
    }

    const colon = line.indexOf(':');
    // HTTP/2 pseudo-headers (`:status: 200`) are not response headers.
    if (colon <= 0) {
      ignoredLines.push(line);
      continue;
    }
    const name = line.slice(0, colon).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      ignoredLines.push(line);
      continue;
    }
    headers.push({ name, value: line.slice(colon + 1).trim() });
  }

  return { headers, statusLine, ignoredLines };
}

/** Lower-cased name → every value received for it, in order. */
type HeaderMap = Map<string, string[]>;

function toMap(headers: HeaderEntry[]): HeaderMap {
  const map: HeaderMap = new Map();
  for (const { name, value } of headers) {
    const key = name.toLowerCase();
    map.set(key, [...(map.get(key) ?? []), value]);
  }
  return map;
}

function single(map: HeaderMap, name: string): string | undefined {
  const values = map.get(name);
  return values ? values.join(', ') : undefined;
}

// --- Content-Security-Policy -------------------------------------------------

/** Directive name → source list, first occurrence wins (as browsers do). */
export function parseCsp(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    if (!directives.has(name)) directives.set(name, tokens.slice(1));
  }
  return directives;
}

function analyzeCsp(map: HeaderMap, findings: HeaderFinding[]): boolean {
  const header = 'Content-Security-Policy';
  const values = map.get('content-security-policy');
  const reportOnly = map.get('content-security-policy-report-only');

  if (reportOnly) {
    findings.push({
      id: 'csp.report-only',
      header: 'Content-Security-Policy-Report-Only',
      status: 'info',
      title: 'Report-only policy',
      detail:
        'A report-only policy reports violations but blocks nothing. It is useful while rolling out a policy; enforcement needs Content-Security-Policy.',
      evidence: reportOnly.join(' | '),
    });
  }

  if (!values) {
    findings.push({
      id: 'csp.missing',
      header,
      status: 'missing',
      title: 'No Content-Security-Policy',
      detail:
        'CSP limits where scripts, styles and frames may load from, which contains the damage of an injection bug. It matters for HTML documents; for JSON APIs and static files it has little effect.',
    });
    return false;
  }

  if (values.length > 1) {
    findings.push({
      id: 'csp.multiple',
      header,
      status: 'info',
      title: 'Several policies',
      detail:
        'Each Content-Security-Policy header is enforced on its own, so a resource must satisfy all of them. Adding a policy can only tighten, never loosen.',
      evidence: values.join(' | '),
    });
  }

  // Analyse the first policy; that is what a reader will usually tune.
  const directives = parseCsp(values[0]);
  const framePolicy = directives.has('frame-ancestors');

  const scriptSources =
    directives.get('script-src') ?? directives.get('default-src');
  const scriptDirective = directives.has('script-src')
    ? 'script-src'
    : 'default-src';

  if (!scriptSources) {
    findings.push({
      id: 'csp.no-script-restriction',
      header,
      status: 'weak',
      title: 'Scripts are not restricted',
      detail:
        'The policy has neither script-src nor default-src, so it places no limit on where scripts load from.',
      evidence: values[0],
    });
  } else {
    const lower = scriptSources.map((source) => source.toLowerCase());
    const hasNonceOrHash = lower.some((source) =>
      /^'(nonce-|sha256-|sha384-|sha512-)/.test(source),
    );
    const strictDynamic = lower.includes("'strict-dynamic'");

    if (lower.includes("'unsafe-inline'")) {
      findings.push(
        hasNonceOrHash
          ? {
              id: 'csp.unsafe-inline-ignored',
              header,
              status: 'info',
              title: `'unsafe-inline' is ignored by modern browsers`,
              detail: `${scriptDirective} also lists a nonce or hash. Browsers that support CSP Level 2 then ignore 'unsafe-inline'; it only remains as a fallback for older ones.`,
            }
          : {
              id: 'csp.unsafe-inline',
              header,
              status: 'weak',
              title: `${scriptDirective} allows inline scripts`,
              detail: `'unsafe-inline' without a nonce or hash lets any injected <script> run, which removes most of CSP's protection against XSS.`,
              evidence: `${scriptDirective} ${scriptSources.join(' ')}`,
            },
      );
    }

    if (lower.includes("'unsafe-eval'")) {
      findings.push({
        id: 'csp.unsafe-eval',
        header,
        status: 'weak',
        title: `${scriptDirective} allows eval()`,
        detail: `'unsafe-eval' permits eval() and new Function(), which turns string injection into code execution.`,
      });
    }

    const broad = lower.filter((source) =>
      ['*', 'http:', 'https:', 'data:', 'blob:'].includes(source),
    );
    if (broad.length > 0 && !strictDynamic) {
      findings.push({
        id: 'csp.broad-script-source',
        header,
        status: 'weak',
        title: `${scriptDirective} allows scripts from broad sources`,
        detail: `${broad.join(', ')} lets scripts load from (nearly) any origin, so an attacker who can inject a <script src> can host the payload anywhere.`,
      });
    }

    if (strictDynamic) {
      findings.push({
        id: 'csp.strict-dynamic',
        header,
        status: 'info',
        title: `'strict-dynamic' in use`,
        detail: `Scripts trusted by a nonce or hash may load further scripts; host allowlists and 'unsafe-inline' in the same directive are ignored by browsers that support it.`,
      });
    }
  }

  if (!directives.has('object-src') && !directives.has('default-src')) {
    findings.push({
      id: 'csp.object-src',
      header,
      status: 'info',
      title: 'Plugins are not restricted',
      detail: `Neither object-src nor default-src is set. object-src 'none' is a common hardening step; modern browsers no longer run plugins, so the practical effect is small.`,
    });
  }

  if (!directives.has('base-uri')) {
    findings.push({
      id: 'csp.base-uri',
      header,
      status: 'info',
      title: 'base-uri not set',
      detail: `base-uri does not fall back to default-src. Without it an injected <base> tag can redirect relative script URLs; base-uri 'self' or 'none' prevents that.`,
    });
  }

  if (framePolicy) {
    findings.push({
      id: 'csp.frame-ancestors',
      header,
      status: 'present',
      title: 'Framing controlled by frame-ancestors',
      detail: 'frame-ancestors decides which sites may embed this page.',
      evidence: `frame-ancestors ${directives.get('frame-ancestors')?.join(' ')}`,
    });
  }

  findings.push({
    id: 'csp.present',
    header,
    status: 'present',
    title: 'Content-Security-Policy is set',
    detail: `${directives.size} directive${directives.size === 1 ? '' : 's'}.`,
    evidence: values[0],
  });

  return framePolicy;
}

// --- Strict-Transport-Security ----------------------------------------------

const ONE_YEAR = 31_536_000;

function analyzeHsts(
  map: HeaderMap,
  findings: HeaderFinding[],
  https: boolean | undefined,
): void {
  const header = 'Strict-Transport-Security';
  const value = map.get('strict-transport-security')?.[0];

  if (!value) {
    findings.push({
      id: 'hsts.missing',
      header,
      status: https === false ? 'info' : 'missing',
      title: 'No Strict-Transport-Security',
      detail:
        https === false
          ? 'Browsers ignore HSTS on plain-HTTP responses; it only takes effect when sent over HTTPS.'
          : 'HSTS tells browsers to use HTTPS for this host from then on, so a later plain-HTTP link or a downgrade attempt never goes out unencrypted.',
    });
    return;
  }

  if (https === false) {
    findings.push({
      id: 'hsts.over-http',
      header,
      status: 'info',
      title: 'Sent over plain HTTP',
      detail: 'Browsers ignore HSTS received over HTTP.',
      evidence: value,
    });
  }

  const maxAgeMatch = /(?:^|;)\s*max-age\s*=\s*"?(\d+)"?/i.exec(value);
  if (!maxAgeMatch) {
    findings.push({
      id: 'hsts.no-max-age',
      header,
      status: 'weak',
      title: 'HSTS without max-age',
      detail:
        'max-age is required (RFC 6797 §6.1.1). Without a valid one, browsers ignore the header.',
      evidence: value,
    });
    return;
  }

  const maxAge = Number(maxAgeMatch[1]);
  const includeSubDomains = /(?:^|;)\s*includesubdomains\s*(?:;|$)/i.test(
    value,
  );
  const preload = /(?:^|;)\s*preload\s*(?:;|$)/i.test(value);

  if (maxAge === 0) {
    findings.push({
      id: 'hsts.disabled',
      header,
      status: 'weak',
      title: 'max-age=0 turns HSTS off',
      detail:
        'A zero max-age tells browsers to forget this host’s HSTS policy (RFC 6797 §6.1.1).',
      evidence: value,
    });
    return;
  }

  findings.push({
    id: 'hsts.present',
    header,
    status: 'present',
    title: 'HSTS is set',
    detail: `Browsers keep using HTTPS for ${formatDuration(maxAge)}${includeSubDomains ? ', subdomains included' : ''}.`,
    evidence: value,
  });

  if (preload && (maxAge < ONE_YEAR || !includeSubDomains)) {
    findings.push({
      id: 'hsts.preload-requirements',
      header,
      status: 'info',
      title: 'preload without its requirements',
      detail:
        'hstspreload.org only accepts a max-age of at least one year together with includeSubDomains.',
    });
  }
}

function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86_400);
  if (days >= 365) {
    const years = Math.round((days / 365) * 10) / 10;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  return `${seconds} seconds`;
}

// --- Simple enumerated headers ----------------------------------------------

function analyzeContentTypeOptions(
  map: HeaderMap,
  findings: HeaderFinding[],
): void {
  const header = 'X-Content-Type-Options';
  const value = map.get('x-content-type-options')?.[0];
  if (!value) {
    findings.push({
      id: 'xcto.missing',
      header,
      status: 'missing',
      title: 'No X-Content-Type-Options',
      detail:
        'nosniff stops browsers from guessing a different content type than the one declared — e.g. running an uploaded text file as a script.',
    });
  } else if (value.trim().toLowerCase() !== 'nosniff') {
    findings.push({
      id: 'xcto.invalid',
      header,
      status: 'weak',
      title: 'Unrecognised value',
      detail: 'The only defined value is nosniff; anything else is ignored.',
      evidence: value,
    });
  } else {
    findings.push({
      id: 'xcto.present',
      header,
      status: 'present',
      title: 'nosniff is set',
      detail: 'Browsers use the declared Content-Type as is.',
      evidence: value,
    });
  }
}

const REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

function analyzeReferrerPolicy(
  map: HeaderMap,
  findings: HeaderFinding[],
): void {
  const header = 'Referrer-Policy';
  const value = single(map, 'referrer-policy');
  if (!value) {
    findings.push({
      id: 'referrer.missing',
      header,
      status: 'info',
      title: 'No Referrer-Policy',
      detail:
        'Browsers then apply their default, strict-origin-when-cross-origin: other sites see only the origin, never the path or query.',
    });
    return;
  }

  // Several comma-separated values are allowed; the last one the browser
  // understands wins (the fallback mechanism in the spec).
  const tokens = value.split(',').map((token) => token.trim().toLowerCase());
  const effective = [...tokens]
    .reverse()
    .find((token) => REFERRER_POLICIES.has(token));

  if (!effective) {
    findings.push({
      id: 'referrer.invalid',
      header,
      status: 'weak',
      title: 'No recognised policy',
      detail:
        'None of the values is a defined policy, so the browser default applies.',
      evidence: value,
    });
    return;
  }

  if (effective === 'unsafe-url') {
    findings.push({
      id: 'referrer.unsafe-url',
      header,
      status: 'weak',
      title: 'unsafe-url sends full URLs everywhere',
      detail:
        'Every request, including to other sites and over plain HTTP, carries the full URL with its path and query — which may hold tokens or identifiers.',
      evidence: value,
    });
  } else if (effective === 'no-referrer-when-downgrade') {
    findings.push({
      id: 'referrer.when-downgrade',
      header,
      status: 'info',
      title: 'Full URL sent to other HTTPS sites',
      detail:
        'no-referrer-when-downgrade only withholds the referrer on HTTPS→HTTP; other HTTPS sites receive the full URL.',
      evidence: value,
    });
  } else {
    findings.push({
      id: 'referrer.present',
      header,
      status: 'present',
      title: `Referrer-Policy: ${effective}`,
      detail: 'Controls how much of this URL other requests may see.',
      evidence: value,
    });
  }
}

function analyzePermissionsPolicy(
  map: HeaderMap,
  findings: HeaderFinding[],
): void {
  const header = 'Permissions-Policy';
  const value = single(map, 'permissions-policy');

  if (map.has('feature-policy')) {
    findings.push({
      id: 'permissions.feature-policy',
      header: 'Feature-Policy',
      status: 'info',
      title: 'Legacy Feature-Policy header',
      detail:
        'Feature-Policy was replaced by Permissions-Policy, which uses a different syntax.',
      evidence: single(map, 'feature-policy'),
    });
  }

  if (!value) {
    findings.push({
      id: 'permissions.missing',
      header,
      status: 'info',
      title: 'No Permissions-Policy',
      detail:
        'Optional. It lets a page turn off browser features (camera, geolocation, …) for itself and its iframes; the defaults already require user permission for the sensitive ones.',
    });
    return;
  }

  // Structured-field dictionary: `feature=(allowlist)` or `feature=*`.
  const members = value
    .split(',')
    .map((member) => member.trim())
    .filter(Boolean);
  const malformed = members.filter(
    (member) => !/^[a-z][a-z0-9-]*=(\*|\(.*\)|self|"[^"]*")$/i.test(member),
  );

  if (malformed.length > 0) {
    findings.push({
      id: 'permissions.malformed',
      header,
      status: 'weak',
      title: 'Unparseable entries',
      detail:
        'Permissions-Policy is a structured header: `feature=(self "https://a.example")`. A browser that cannot parse it ignores the whole header.',
      evidence: malformed.join(', '),
    });
    return;
  }

  findings.push({
    id: 'permissions.present',
    header,
    status: 'present',
    title: `Permissions-Policy sets ${members.length} feature${members.length === 1 ? '' : 's'}`,
    detail: members.map((member) => member.split('=')[0]).join(', '),
    evidence: value,
  });
}

function analyzeEnum(
  map: HeaderMap,
  findings: HeaderFinding[],
  spec: {
    key: string;
    header: string;
    allowed: string[];
    missing: string;
    permissive?: string;
    permissiveDetail?: string;
  },
): void {
  const value = map.get(spec.key)?.[0];
  if (!value) {
    findings.push({
      id: `${spec.key}.missing`,
      header: spec.header,
      status: 'info',
      title: `No ${spec.header}`,
      detail: spec.missing,
    });
    return;
  }

  const token = value.split(';')[0].trim().toLowerCase();
  if (!spec.allowed.includes(token)) {
    findings.push({
      id: `${spec.key}.invalid`,
      header: spec.header,
      status: 'weak',
      title: 'Unrecognised value',
      detail: `Defined values: ${spec.allowed.join(', ')}. Anything else is treated as if the header were absent.`,
      evidence: value,
    });
  } else if (spec.permissive && token === spec.permissive) {
    findings.push({
      id: `${spec.key}.permissive`,
      header: spec.header,
      status: 'info',
      title: `${spec.header}: ${token}`,
      detail:
        spec.permissiveDetail ?? 'The permissive default, stated explicitly.',
      evidence: value,
    });
  } else {
    findings.push({
      id: `${spec.key}.present`,
      header: spec.header,
      status: 'present',
      title: `${spec.header}: ${token}`,
      detail: 'Set to a defined value.',
      evidence: value,
    });
  }
}

function analyzeFrameOptions(
  map: HeaderMap,
  findings: HeaderFinding[],
  hasFrameAncestors: boolean,
): void {
  const header = 'X-Frame-Options';
  const value = map.get('x-frame-options')?.[0];

  if (!value) {
    findings.push(
      hasFrameAncestors
        ? {
            id: 'xfo.superseded',
            header,
            status: 'info',
            title: 'Not needed alongside frame-ancestors',
            detail:
              'CSP frame-ancestors already controls framing, and browsers that support it ignore X-Frame-Options. It only matters for very old browsers.',
          }
        : {
            id: 'xfo.missing',
            header,
            status: 'missing',
            title: 'No framing protection',
            detail:
              'Neither X-Frame-Options nor CSP frame-ancestors is set, so any site can embed this response in a frame. That matters for pages with actions a user could be tricked into clicking (clickjacking); not for APIs or static files.',
          },
    );
    return;
  }

  const token = value.trim().toUpperCase();
  if (token.startsWith('ALLOW-FROM')) {
    findings.push({
      id: 'xfo.allow-from',
      header,
      status: 'weak',
      title: 'ALLOW-FROM is obsolete',
      detail:
        'Current browsers ignore ALLOW-FROM, which leaves the page frameable. Use CSP frame-ancestors to name allowed embedders.',
      evidence: value,
    });
  } else if (token === 'DENY' || token === 'SAMEORIGIN') {
    findings.push({
      id: 'xfo.present',
      header,
      status: 'present',
      title: `X-Frame-Options: ${token}`,
      detail: hasFrameAncestors
        ? 'CSP frame-ancestors is also set and takes precedence in browsers that support it.'
        : 'Controls which sites may frame this response.',
      evidence: value,
    });
  } else {
    findings.push({
      id: 'xfo.invalid',
      header,
      status: 'weak',
      title: 'Unrecognised value',
      detail: 'Only DENY and SAMEORIGIN are honoured.',
      evidence: value,
    });
  }
}

// --- Cache-Control -----------------------------------------------------------

function analyzeCacheControl(map: HeaderMap, findings: HeaderFinding[]): void {
  const header = 'Cache-Control';
  const value = single(map, 'cache-control');
  const setsCookie = map.has('set-cookie');

  if (!value) {
    findings.push({
      id: 'cache.missing',
      header,
      status: 'info',
      title: 'No Cache-Control',
      detail:
        'Caches may then store the response heuristically (RFC 9111 §4.2.2), based on Last-Modified. Fine for static files; worth setting for personalised responses.',
    });
    return;
  }

  const directives = value
    .toLowerCase()
    .split(',')
    .map((directive) => directive.trim());
  const isPublic = directives.includes('public');
  const shared = directives.some((d) => d.startsWith('s-maxage'));

  if (setsCookie && (isPublic || shared) && !directives.includes('no-store')) {
    findings.push({
      id: 'cache.public-set-cookie',
      header,
      status: 'weak',
      title: 'Shared caching of a response that sets cookies',
      detail:
        'The response is marked cacheable by shared caches (public / s-maxage) and also carries Set-Cookie. Depending on the CDN, one visitor’s cookie could be served to another.',
      evidence: value,
    });
  }

  findings.push({
    id: 'cache.present',
    header,
    status: directives.includes('no-store') ? 'present' : 'info',
    title: `Cache-Control: ${value}`,
    detail: directives.includes('no-store')
      ? 'no-store: nothing keeps a copy.'
      : directives.includes('private')
        ? 'private: only the browser may cache it.'
        : 'Read the directives against what this response contains.',
    evidence: value,
  });
}

// --- CORS --------------------------------------------------------------------

function analyzeCors(map: HeaderMap, findings: HeaderFinding[]): void {
  const allowOrigin = map.get('access-control-allow-origin')?.[0]?.trim();
  if (allowOrigin === undefined) {
    findings.push({
      id: 'cors.none',
      header: 'Access-Control-Allow-Origin',
      status: 'info',
      title: 'No CORS headers',
      detail:
        'Other origins cannot read this response from JavaScript. That is the safe default; it only needs changing for APIs meant to be called cross-origin.',
    });
    return;
  }

  const credentials =
    map.get('access-control-allow-credentials')?.[0]?.trim().toLowerCase() ===
    'true';
  const vary = (single(map, 'vary') ?? '').toLowerCase();

  if (allowOrigin === '*') {
    findings.push(
      credentials
        ? {
            id: 'cors.wildcard-credentials',
            header: 'Access-Control-Allow-Origin',
            status: 'weak',
            title: 'Wildcard origin with credentials',
            detail:
              'Browsers refuse credentialed requests when the allowed origin is `*`, so this combination never works as intended — often a sign the server reflects origins elsewhere.',
            evidence: `Access-Control-Allow-Origin: *; Access-Control-Allow-Credentials: true`,
          }
        : {
            id: 'cors.wildcard',
            header: 'Access-Control-Allow-Origin',
            status: 'info',
            title: 'Readable by any origin',
            detail:
              'Any site can read this response, without cookies. Appropriate for public data; not for anything user-specific.',
            evidence: allowOrigin,
          },
    );
    return;
  }

  if (allowOrigin.toLowerCase() === 'null') {
    findings.push({
      id: 'cors.null',
      header: 'Access-Control-Allow-Origin',
      status: 'weak',
      title: 'Origin "null" is allowed',
      detail:
        'Sandboxed iframes and some redirects send Origin: null, so any site can obtain it. Allowing it is effectively allowing everyone.',
      evidence: allowOrigin,
    });
    return;
  }

  findings.push({
    id: 'cors.specific',
    header: 'Access-Control-Allow-Origin',
    status: 'present',
    title: `Readable by ${allowOrigin}${credentials ? ', with credentials' : ''}`,
    detail: credentials
      ? 'That origin can make credentialed requests and read the responses — make sure it is fully trusted.'
      : 'Only that origin can read this response from JavaScript.',
    evidence: allowOrigin,
  });

  if (
    !vary
      .split(',')
      .map((v) => v.trim())
      .includes('origin')
  ) {
    findings.push({
      id: 'cors.vary',
      header: 'Vary',
      status: 'info',
      title: 'No Vary: Origin',
      detail:
        'If the server picks Access-Control-Allow-Origin per request, caches need Vary: Origin or they may serve one origin’s answer to another. Not needed if this value never changes.',
    });
  }
}

// --- Disclosure --------------------------------------------------------------

function analyzeDisclosure(map: HeaderMap, findings: HeaderFinding[]): void {
  for (const [key, header] of [
    ['x-powered-by', 'X-Powered-By'],
    ['server', 'Server'],
  ] as const) {
    const value = map.get(key)?.[0];
    if (value && /\d/.test(value)) {
      findings.push({
        id: `disclosure.${key}`,
        header,
        status: 'info',
        title: `${header} names a version`,
        detail:
          'Version numbers make it easier to match the server against known vulnerabilities. Harmless on its own.',
        evidence: value,
      });
    }
  }
}

const STATUS_ORDER: Record<FindingStatus, number> = {
  weak: 0,
  missing: 1,
  info: 2,
  present: 3,
};

export function analyzeHeaders(
  headers: HeaderEntry[],
  options: AnalyzeOptions = {},
): HeaderAnalysis {
  const map = toMap(headers);
  const findings: HeaderFinding[] = [];

  const hasFrameAncestors = analyzeCsp(map, findings);
  analyzeHsts(map, findings, options.https);
  analyzeContentTypeOptions(map, findings);
  analyzeFrameOptions(map, findings, hasFrameAncestors);
  analyzeReferrerPolicy(map, findings);
  analyzePermissionsPolicy(map, findings);
  analyzeEnum(map, findings, {
    key: 'cross-origin-opener-policy',
    header: 'Cross-Origin-Opener-Policy',
    allowed: [
      'unsafe-none',
      'same-origin-allow-popups',
      'same-origin',
      'noopener-allow-popups',
    ],
    missing:
      'Optional. same-origin puts this page in its own browsing context group, cutting window.opener links to cross-origin popups; needed for cross-origin isolation.',
    permissive: 'unsafe-none',
  });
  analyzeEnum(map, findings, {
    key: 'cross-origin-resource-policy',
    header: 'Cross-Origin-Resource-Policy',
    allowed: ['same-site', 'same-origin', 'cross-origin'],
    missing:
      'Optional. It stops other sites from embedding this resource (image, script, …) in their pages.',
    permissive: 'cross-origin',
    permissiveDetail:
      'Any site may embed this resource — expected for public assets and CDNs.',
  });
  analyzeEnum(map, findings, {
    key: 'cross-origin-embedder-policy',
    header: 'Cross-Origin-Embedder-Policy',
    allowed: ['unsafe-none', 'require-corp', 'credentialless'],
    missing:
      'Optional. Only needed, together with COOP same-origin, when a page wants cross-origin isolation (SharedArrayBuffer, precise timers).',
    permissive: 'unsafe-none',
  });
  analyzeCacheControl(map, findings);
  analyzeCors(map, findings);
  analyzeDisclosure(map, findings);

  findings.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const counts: Record<FindingStatus, number> = {
    present: 0,
    missing: 0,
    weak: 0,
    info: 0,
  };
  for (const finding of findings) counts[finding.status]++;

  return { findings, counts };
}
