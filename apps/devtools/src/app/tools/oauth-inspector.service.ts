import { Injectable } from '@angular/core';

/**
 * OAuth / OIDC Inspector — a debugger, not a client. It reads an
 * authorization URL, decodes a JWT and does PKCE arithmetic, all in the tab:
 * nothing here makes a network request, and nothing is sent anywhere.
 *
 * Every check cites the rule it applies (RFC 6749, RFC 7636, RFC 9700 — the
 * OAuth 2.0 Security BCP — and OpenID Connect Core). Checks only say what
 * the URL or token shows; whether the authorization server enforces anything
 * cannot be known from here.
 */

export type CheckLevel = 'ok' | 'info' | 'warning' | 'error';

export interface Check {
  id: string;
  level: CheckLevel;
  message: string;
}

export interface AuthorizationUrlReport {
  endpoint: string;
  params: {
    clientId?: string;
    redirectUri?: string;
    responseType?: string;
    scopes: string[];
    state?: string;
    nonce?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    prompt?: string;
    responseMode?: string;
  };
  /** Parameters outside the list above, in URL order. */
  otherParams: { name: string; value: string }[];
  isOidc: boolean;
  checks: Check[];
}

const KNOWN_PARAMS = new Set([
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
  'prompt',
  'response_mode',
]);

const PROMPT_VALUES = new Set(['none', 'login', 'consent', 'select_account']);

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url(SHA-256) is always 43 characters without padding. */
const S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

// --- JWT --------------------------------------------------------------------

export type TimeState = 'valid' | 'expired' | 'not-yet-valid' | 'future-issued';

export interface TimeClaim {
  claim: 'exp' | 'nbf' | 'iat' | 'auth_time';
  seconds: number;
  iso: string;
  relative: string;
}

export interface JwtReport {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Byte length of the signature segment; never interpreted. */
  signatureBytes: number;
  issuer?: string;
  subject?: string;
  audience: string[];
  times: TimeClaim[];
  timeState: TimeState;
  checks: Check[];
}

export class JwtDecodeError extends Error {}

function base64UrlDecode(segment: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) {
    throw new JwtDecodeError('contains characters outside base64url');
  }
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonSegment(
  segment: string,
  label: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  } catch (error) {
    const reason =
      error instanceof JwtDecodeError ? error.message : 'is not valid JSON';
    throw new JwtDecodeError(`The ${label} ${reason}.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new JwtDecodeError(`The ${label} is not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export function relativeTime(seconds: number, nowSeconds: number): string {
  const delta = seconds - nowSeconds;
  const abs = Math.abs(delta);
  const units: [number, string][] = [
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  const [size, unit] = units.find(([s]) => abs >= s) ?? [1, 'second'];
  const count = Math.floor(abs / size);
  const text = `${count} ${unit}${count === 1 ? '' : 's'}`;
  return delta >= 0 ? `in ${text}` : `${text} ago`;
}

// --- PKCE -------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface VerifierCheck {
  valid: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class OAuthInspector {
  // --- Authorization URL ----------------------------------------------------

  inspectAuthorizationUrl(input: string): AuthorizationUrlReport {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      throw new Error('Not an absolute URL.');
    }

    const checks: Check[] = [];
    const get = (name: string) => url.searchParams.get(name) ?? undefined;

    // RFC 6749 §3.1: parameters MUST NOT be included more than once.
    const names = [...url.searchParams.keys()];
    const duplicates = [
      ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
    ];
    for (const name of duplicates) {
      checks.push({
        id: `duplicate.${name}`,
        level: 'error',
        message: `"${name}" appears more than once; RFC 6749 §3.1 forbids repeated parameters and servers must reject them.`,
      });
    }

    const params: AuthorizationUrlReport['params'] = {
      clientId: get('client_id'),
      redirectUri: get('redirect_uri'),
      responseType: get('response_type'),
      scopes: (get('scope') ?? '').split(' ').filter(Boolean),
      state: get('state'),
      nonce: get('nonce'),
      codeChallenge: get('code_challenge'),
      codeChallengeMethod: get('code_challenge_method'),
      prompt: get('prompt'),
      responseMode: get('response_mode'),
    };

    // Endpoint transport — RFC 6749 §3.1 requires TLS.
    if (url.protocol !== 'https:') {
      checks.push(
        isLoopback(url.hostname)
          ? {
              id: 'endpoint.loopback',
              level: 'info',
              message:
                'Plain-HTTP endpoint on a loopback address — fine for local development only.',
            }
          : {
              id: 'endpoint.http',
              level: 'error',
              message:
                'The authorization endpoint is not HTTPS; RFC 6749 §3.1 requires TLS.',
            },
      );
    }
    if (url.hash) {
      checks.push({
        id: 'endpoint.fragment',
        level: 'warning',
        message:
          'The endpoint URL has a fragment; RFC 6749 §3.1 says it MUST NOT.',
      });
    }

    if (!params.clientId) {
      checks.push({
        id: 'client_id.missing',
        level: 'error',
        message: 'client_id is missing; it is required (RFC 6749 §4.1.1).',
      });
    }

    if (url.searchParams.has('client_secret')) {
      checks.push({
        id: 'client_secret.in-url',
        level: 'error',
        message:
          'A client_secret is in the authorization URL. This URL passes through the browser, history and logs — the secret should be treated as leaked and rotated.',
      });
    }

    // response_type
    const responseTypes = (params.responseType ?? '')
      .split(' ')
      .filter(Boolean);
    if (responseTypes.length === 0) {
      checks.push({
        id: 'response_type.missing',
        level: 'error',
        message: 'response_type is missing; it is required (RFC 6749 §3.1.1).',
      });
    } else if (responseTypes.includes('token')) {
      checks.push({
        id: 'response_type.implicit',
        level: 'warning',
        message:
          'response_type includes "token" (implicit grant). RFC 9700 §2.1.2 says not to use it, and OAuth 2.1 removes it — use "code" with PKCE.',
      });
    } else if (responseTypes.length === 1 && responseTypes[0] === 'code') {
      checks.push({
        id: 'response_type.code',
        level: 'ok',
        message: 'Authorization Code flow (response_type=code).',
      });
    }

    const isOidc = params.scopes.includes('openid');
    const returnsIdToken = responseTypes.includes('id_token');

    // redirect_uri
    if (params.redirectUri) {
      try {
        const redirect = new URL(params.redirectUri);
        if (redirect.hash) {
          checks.push({
            id: 'redirect_uri.fragment',
            level: 'error',
            message:
              'redirect_uri contains a fragment; RFC 6749 §3.1.2 says it MUST NOT.',
          });
        }
        if (redirect.protocol === 'https:') {
          checks.push({
            id: 'redirect_uri.https',
            level: 'ok',
            message: 'redirect_uri uses HTTPS.',
          });
        } else if (redirect.protocol === 'http:') {
          checks.push(
            isLoopback(redirect.hostname)
              ? {
                  id: 'redirect_uri.loopback',
                  level: 'info',
                  message:
                    'redirect_uri is plain HTTP on loopback — allowed for native apps (RFC 8252 §7.3) and local development.',
                }
              : {
                  id: 'redirect_uri.http',
                  level: 'warning',
                  message:
                    'redirect_uri is plain HTTP on a non-loopback host, so the authorization code travels unencrypted.',
                },
          );
        } else {
          checks.push({
            id: 'redirect_uri.custom-scheme',
            level: 'info',
            message: `redirect_uri uses the "${redirect.protocol}" scheme — typical of a native app (RFC 8252 §7.1).`,
          });
        }
      } catch {
        checks.push({
          id: 'redirect_uri.invalid',
          level: 'error',
          message: 'redirect_uri is not an absolute URI (RFC 6749 §3.1.2).',
        });
      }
    } else {
      checks.push({
        id: 'redirect_uri.missing',
        level: 'info',
        message:
          'No redirect_uri. That is allowed when the client registered exactly one; OAuth 2.1 and most providers require it.',
      });
    }

    // PKCE — RFC 7636, RFC 9700 §2.1.1
    const hasPkce = Boolean(params.codeChallenge);
    if (hasPkce) {
      const method = params.codeChallengeMethod;
      if (!method) {
        checks.push({
          id: 'pkce.method-missing',
          level: 'warning',
          message:
            'code_challenge without code_challenge_method means "plain" (RFC 7636 §4.3). Send S256.',
        });
      } else if (method === 'plain') {
        checks.push({
          id: 'pkce.plain',
          level: 'warning',
          message:
            'PKCE method "plain" puts the verifier itself in the URL. RFC 9700 §2.1.1 recommends S256.',
        });
      } else if (method === 'S256') {
        if (S256_CHALLENGE_PATTERN.test(params.codeChallenge ?? '')) {
          checks.push({
            id: 'pkce.s256',
            level: 'ok',
            message: 'PKCE with S256.',
          });
        } else {
          checks.push({
            id: 'pkce.s256-malformed',
            level: 'error',
            message:
              'An S256 code_challenge is always 43 base64url characters; this one is not.',
          });
        }
      } else {
        checks.push({
          id: 'pkce.method-unknown',
          level: 'error',
          message: `Unknown code_challenge_method "${method}"; RFC 7636 defines S256 and plain.`,
        });
      }
    } else {
      if (params.codeChallengeMethod) {
        checks.push({
          id: 'pkce.method-without-challenge',
          level: 'error',
          message:
            'code_challenge_method is set but code_challenge is missing.',
        });
      }
      if (responseTypes.includes('code')) {
        checks.push({
          id: 'pkce.missing',
          level: 'warning',
          message:
            'No PKCE. RFC 9700 §2.1.1 recommends it for every client, and OAuth 2.1 requires it.',
        });
      }
    }

    // state — RFC 6749 §10.12, RFC 9700 §2.1
    if (params.state) {
      checks.push({
        id: 'state.present',
        level: 'ok',
        message: 'state is present.',
      });
      if (params.state.length < 8) {
        checks.push({
          id: 'state.short',
          level: 'info',
          message:
            'state is very short; if it is the CSRF defence it should be unguessable.',
        });
      }
    } else {
      checks.push(
        hasPkce
          ? {
              id: 'state.missing-pkce',
              level: 'info',
              message:
                'No state. With PKCE the client may rely on it for CSRF protection (RFC 9700 §2.1), provided the server enforces PKCE.',
            }
          : {
              id: 'state.missing',
              level: 'warning',
              message:
                'No state and no PKCE: nothing in this request protects the callback against CSRF (RFC 6749 §10.12).',
            },
      );
    }

    // nonce — OIDC Core §3.2.2.1 / §3.3.2.11
    if (isOidc) {
      if (params.nonce) {
        checks.push({
          id: 'nonce.present',
          level: 'ok',
          message: 'nonce is present.',
        });
      } else if (returnsIdToken) {
        checks.push({
          id: 'nonce.required',
          level: 'error',
          message:
            'An ID token is returned from the authorization endpoint, so nonce is REQUIRED (OIDC Core §3.2.2.1).',
        });
      } else {
        checks.push({
          id: 'nonce.optional',
          level: 'info',
          message:
            'No nonce. Optional for the code flow in OIDC, but it binds the ID token to this request.',
        });
      }
    } else if (returnsIdToken) {
      checks.push({
        id: 'openid.missing',
        level: 'error',
        message:
          'An id_token is requested without the "openid" scope; that is not an OIDC request.',
      });
    }

    if (params.prompt) {
      const unknown = params.prompt
        .split(' ')
        .filter((v) => !PROMPT_VALUES.has(v));
      if (unknown.length > 0) {
        checks.push({
          id: 'prompt.unknown',
          level: 'info',
          message: `prompt value(s) ${unknown.join(', ')} are not defined by OIDC Core (none, login, consent, select_account).`,
        });
      }
      if (params.prompt.includes('none') && params.prompt.trim() !== 'none') {
        checks.push({
          id: 'prompt.none-combined',
          level: 'error',
          message:
            'prompt=none may not be combined with other values (OIDC Core §3.1.2.1).',
        });
      }
    }

    const otherParams = [...url.searchParams.entries()]
      .filter(([name]) => !KNOWN_PARAMS.has(name))
      .map(([name, value]) => ({ name, value }));

    if (
      otherParams.some((p) => p.name === 'request' || p.name === 'request_uri')
    ) {
      checks.push({
        id: 'jar',
        level: 'info',
        message:
          'The request is passed by value or reference (JAR / PAR); the parameters that matter may be inside it.',
      });
    }

    return {
      endpoint: `${url.origin}${url.pathname}`,
      params,
      otherParams,
      isOidc,
      checks,
    };
  }

  // --- JWT ------------------------------------------------------------------

  decodeJwt(input: string, now = Date.now()): JwtReport {
    const token = input.trim().replace(/^bearer\s+/i, '');
    const segments = token.split('.');

    if (segments.length === 5) {
      throw new JwtDecodeError(
        'This is an encrypted JWT (JWE). Its payload cannot be read without the decryption key.',
      );
    }
    if (segments.length !== 3) {
      throw new JwtDecodeError(
        `A JWT has three dot-separated parts; this has ${segments.length}.`,
      );
    }

    const header = decodeJsonSegment(segments[0], 'header');
    const payload = decodeJsonSegment(segments[1], 'payload');
    const signatureBytes = segments[2]
      ? base64UrlDecode(segments[2]).length
      : 0;

    const checks: Check[] = [];
    const nowSeconds = Math.floor(now / 1000);

    const alg = header['alg'];
    if (
      alg === 'none' ||
      (typeof alg === 'string' && alg.toLowerCase() === 'none')
    ) {
      checks.push({
        id: 'alg.none',
        level: 'warning',
        message: 'alg is "none": an unsecured JWT. Anyone can have written it.',
      });
    } else if (typeof alg !== 'string') {
      checks.push({
        id: 'alg.missing',
        level: 'error',
        message: 'The header has no "alg"; it is required (RFC 7515 §4.1.1).',
      });
    }
    if (alg !== 'none' && signatureBytes === 0) {
      checks.push({
        id: 'signature.empty',
        level: 'warning',
        message: `The header says ${String(alg)} but the signature is empty.`,
      });
    }

    const times: TimeClaim[] = [];
    for (const claim of ['exp', 'nbf', 'iat', 'auth_time'] as const) {
      const value = payload[claim];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        checks.push({
          id: `${claim}.invalid`,
          level: 'error',
          message: `"${claim}" must be a NumericDate (seconds since the epoch), got ${JSON.stringify(value)}.`,
        });
        continue;
      }
      times.push({
        claim,
        seconds: value,
        iso: new Date(value * 1000).toISOString(),
        relative: relativeTime(value, nowSeconds),
      });
    }

    const exp = times.find((t) => t.claim === 'exp')?.seconds;
    const nbf = times.find((t) => t.claim === 'nbf')?.seconds;
    const iat = times.find((t) => t.claim === 'iat')?.seconds;

    let timeState: TimeState = 'valid';
    if (exp !== undefined && exp <= nowSeconds) timeState = 'expired';
    else if (nbf !== undefined && nbf > nowSeconds) timeState = 'not-yet-valid';
    else if (iat !== undefined && iat > nowSeconds + 60)
      timeState = 'future-issued';

    if (exp === undefined) {
      checks.push({
        id: 'exp.missing',
        level: 'info',
        message: 'No "exp": this token does not expire by itself.',
      });
    }

    const audience = Array.isArray(payload['aud'])
      ? payload['aud'].filter((a): a is string => typeof a === 'string')
      : typeof payload['aud'] === 'string'
        ? [payload['aud']]
        : [];

    checks.push({
      id: 'signature.unverified',
      level: 'info',
      message:
        'Decoded only. The signature has not been verified, so nothing here proves who issued this token or that it was not altered.',
    });

    return {
      header,
      payload,
      signatureBytes,
      issuer: typeof payload['iss'] === 'string' ? payload['iss'] : undefined,
      subject: typeof payload['sub'] === 'string' ? payload['sub'] : undefined,
      audience,
      times,
      timeState,
      checks,
    };
  }

  // --- PKCE -----------------------------------------------------------------

  /** RFC 7636 §4.1's recommendation: 32 random octets, base64url → 43 chars. */
  generateVerifier(): string {
    return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  }

  checkVerifier(verifier: string): VerifierCheck {
    if (verifier.length < 43 || verifier.length > 128) {
      return {
        valid: false,
        message: `A code_verifier is 43–128 characters (RFC 7636 §4.1); this one is ${verifier.length}.`,
      };
    }
    if (!VERIFIER_PATTERN.test(verifier)) {
      return {
        valid: false,
        message: 'Only A–Z, a–z, 0–9 and - . _ ~ are allowed (RFC 7636 §4.1).',
      };
    }
    return { valid: true, message: 'A valid code_verifier.' };
  }

  /** S256: BASE64URL(SHA256(ASCII(code_verifier))) — RFC 7636 §4.2. */
  async deriveChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    );
    return base64UrlEncode(new Uint8Array(digest));
  }

  async verifyPair(
    verifier: string,
    challenge: string,
    method: 'S256' | 'plain' = 'S256',
  ): Promise<boolean> {
    const expected =
      method === 'plain' ? verifier : await this.deriveChallenge(verifier);
    return expected === challenge.trim();
  }
}
