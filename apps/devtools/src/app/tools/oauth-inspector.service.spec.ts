import {
  JwtDecodeError,
  OAuthInspector,
  relativeTime,
} from './oauth-inspector.service';

const inspector = new OAuthInspector();

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function jwt(
  payload: Record<string, unknown>,
  header = { alg: 'ES256', typ: 'JWT' },
) {
  return `${b64url(header)}.${b64url(payload)}.c2lnbmF0dXJl`;
}

function checkIds(url: string): string[] {
  return inspector.inspectAuthorizationUrl(url).checks.map((c) => c.id);
}

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const GOOD =
  'https://auth.example.com/oauth2/authorize?client_id=app&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb' +
  `&response_type=code&scope=openid%20profile%20email&state=abcdef123456&nonce=n-0S6_WzA2Mj&code_challenge=${CHALLENGE}&code_challenge_method=S256&prompt=login&foo=bar`;

describe('authorization URL', () => {
  it('parses the standard parameters and keeps the rest', () => {
    const report = inspector.inspectAuthorizationUrl(GOOD);
    expect(report.endpoint).toBe('https://auth.example.com/oauth2/authorize');
    expect(report.params).toMatchObject({
      clientId: 'app',
      redirectUri: 'https://app.example.com/cb',
      responseType: 'code',
      scopes: ['openid', 'profile', 'email'],
      state: 'abcdef123456',
      codeChallengeMethod: 'S256',
      prompt: 'login',
    });
    expect(report.isOidc).toBe(true);
    expect(report.otherParams).toEqual([{ name: 'foo', value: 'bar' }]);
  });

  it('reports a well-formed PKCE + state + nonce request as ok', () => {
    const report = inspector.inspectAuthorizationUrl(GOOD);
    const levels = new Set(report.checks.map((c) => c.level));
    expect(levels.has('error')).toBe(false);
    expect(levels.has('warning')).toBe(false);
    expect(report.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'response_type.code',
        'redirect_uri.https',
        'pkce.s256',
        'state.present',
        'nonce.present',
      ]),
    );
  });

  it('flags missing PKCE and state on a code request', () => {
    const ids = checkIds(
      'https://a.example/authorize?client_id=x&response_type=code&redirect_uri=https://b.example/cb',
    );
    expect(ids).toContain('pkce.missing');
    expect(ids).toContain('state.missing');
  });

  it('treats a missing state as informational when PKCE is present', () => {
    const ids = checkIds(
      `https://a.example/authorize?client_id=x&response_type=code&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
    );
    expect(ids).toContain('state.missing-pkce');
    expect(ids).not.toContain('state.missing');
  });

  it('distinguishes plain, default and malformed PKCE', () => {
    const base = 'https://a.example/authorize?client_id=x&response_type=code';
    expect(
      checkIds(`${base}&code_challenge=abc&code_challenge_method=plain`),
    ).toContain('pkce.plain');
    expect(checkIds(`${base}&code_challenge=abc`)).toContain(
      'pkce.method-missing',
    );
    expect(
      checkIds(`${base}&code_challenge=short&code_challenge_method=S256`),
    ).toContain('pkce.s256-malformed');
    expect(checkIds(`${base}&code_challenge_method=S256`)).toContain(
      'pkce.method-without-challenge',
    );
  });

  it('flags the implicit grant and nonce rules for id_token', () => {
    const ids = checkIds(
      'https://a.example/authorize?client_id=x&response_type=id_token%20token&scope=openid',
    );
    expect(ids).toContain('response_type.implicit');
    expect(ids).toContain('nonce.required');
  });

  it('checks redirect_uri transport and fragments', () => {
    const base =
      'https://a.example/authorize?client_id=x&response_type=code&redirect_uri=';
    expect(
      checkIds(`${base}${encodeURIComponent('http://app.example/cb')}`),
    ).toContain('redirect_uri.http');
    expect(
      checkIds(`${base}${encodeURIComponent('http://127.0.0.1:5000/cb')}`),
    ).toContain('redirect_uri.loopback');
    expect(
      checkIds(`${base}${encodeURIComponent('https://app.example/cb#x')}`),
    ).toContain('redirect_uri.fragment');
    expect(
      checkIds(`${base}${encodeURIComponent('com.example.app:/cb')}`),
    ).toContain('redirect_uri.custom-scheme');
  });

  it('flags duplicates, a leaked client secret and a plain-HTTP endpoint', () => {
    const ids = checkIds(
      'http://auth.example/authorize?client_id=a&client_id=b&response_type=code&client_secret=oops',
    );
    expect(ids).toContain('duplicate.client_id');
    expect(ids).toContain('client_secret.in-url');
    expect(ids).toContain('endpoint.http');
  });

  it('checks prompt values', () => {
    const base =
      'https://a.example/authorize?client_id=x&response_type=code&prompt=';
    expect(checkIds(`${base}none%20login`)).toContain('prompt.none-combined');
    expect(checkIds(`${base}sometimes`)).toContain('prompt.unknown');
  });

  it('rejects something that is not a URL', () => {
    expect(() => inspector.inspectAuthorizationUrl('client_id=x')).toThrow(
      'Not an absolute URL.',
    );
  });
});

describe('JWT decoding', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const nowSeconds = now / 1000;

  it('decodes header, payload, audience and timestamps', () => {
    const report = inspector.decodeJwt(
      `Bearer ${jwt({
        iss: 'https://auth.example.com',
        sub: 'user-1',
        aud: ['api', 'web'],
        exp: nowSeconds + 3600,
        iat: nowSeconds - 60,
      })}`,
      now,
    );
    expect(report.header['alg']).toBe('ES256');
    expect(report.issuer).toBe('https://auth.example.com');
    expect(report.subject).toBe('user-1');
    expect(report.audience).toEqual(['api', 'web']);
    expect(report.timeState).toBe('valid');
    expect(report.times.find((t) => t.claim === 'exp')).toMatchObject({
      iso: '2026-09-24T13:00:00.000Z',
      relative: 'in 1 hour',
    });
    expect(report.signatureBytes).toBe(9);
  });

  it('says expired, not yet valid, or issued in the future', () => {
    expect(
      inspector.decodeJwt(jwt({ exp: nowSeconds - 1 }), now).timeState,
    ).toBe('expired');
    expect(
      inspector.decodeJwt(jwt({ nbf: nowSeconds + 10 }), now).timeState,
    ).toBe('not-yet-valid');
    expect(
      inspector.decodeJwt(jwt({ iat: nowSeconds + 3600 }), now).timeState,
    ).toBe('future-issued');
  });

  it('never claims the signature is verified', () => {
    const report = inspector.decodeJwt(jwt({ sub: 'x' }), now);
    const unverified = report.checks.find(
      (c) => c.id === 'signature.unverified',
    );
    expect(unverified?.message).toMatch(/not been verified/);
    expect(JSON.stringify(report)).not.toMatch(/signature (is )?valid/i);
  });

  it('warns about alg none and non-numeric dates', () => {
    const report = inspector.decodeJwt(
      jwt({ exp: '2026-01-01' }, { alg: 'none', typ: 'JWT' }),
      now,
    );
    const ids = report.checks.map((c) => c.id);
    expect(ids).toContain('alg.none');
    expect(ids).toContain('exp.invalid');
  });

  it('rejects malformed tokens with a readable reason', () => {
    expect(() => inspector.decodeJwt('abc.def')).toThrow(
      /three dot-separated parts/,
    );
    expect(() => inspector.decodeJwt('a.b.c.d.e')).toThrow(JwtDecodeError);
    expect(() =>
      inspector.decodeJwt(`${b64url({ alg: 'HS256' })}.@@@.x`),
    ).toThrow(/payload contains characters outside base64url/);
    expect(() =>
      inspector.decodeJwt(
        `${btoa('not json').replace(/=+$/, '')}.${b64url({})}.x`,
      ),
    ).toThrow(/header is not valid JSON/);
    expect(() => inspector.decodeJwt(`${b64url([1])}.${b64url({})}.x`)).toThrow(
      /header is not a JSON object/,
    );
  });

  it('formats relative times', () => {
    expect(relativeTime(100, 100 + 2 * 86_400)).toBe('2 days ago');
    expect(relativeTime(130, 100)).toBe('in 30 seconds');
  });
});

describe('PKCE', () => {
  it('derives the RFC 7636 Appendix B challenge', async () => {
    await expect(
      inspector.deriveChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe(CHALLENGE);
  });

  it('generates valid 43-character verifiers', () => {
    const verifier = inspector.generateVerifier();
    expect(verifier).toHaveLength(43);
    expect(inspector.checkVerifier(verifier).valid).toBe(true);
    expect(inspector.generateVerifier()).not.toBe(verifier);
  });

  it('validates verifier length and alphabet', () => {
    expect(inspector.checkVerifier('short').valid).toBe(false);
    expect(inspector.checkVerifier(`${'a'.repeat(42)}+`).message).toMatch(
      /Only A–Z/,
    );
  });

  it('verifies a verifier against a challenge', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(inspector.verifyPair(verifier, CHALLENGE)).resolves.toBe(true);
    await expect(inspector.verifyPair(verifier, `${CHALLENGE}x`)).resolves.toBe(
      false,
    );
    await expect(
      inspector.verifyPair('plain-value', 'plain-value', 'plain'),
    ).resolves.toBe(true);
  });
});
