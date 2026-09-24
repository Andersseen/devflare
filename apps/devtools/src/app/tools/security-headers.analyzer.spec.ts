import {
  analyzeHeaders,
  parseCsp,
  parseRawHeaders,
  type HeaderEntry,
} from './security-headers.analyzer';

function h(text: string): HeaderEntry[] {
  return parseRawHeaders(text).headers;
}

function ids(text: string, https?: boolean): string[] {
  return analyzeHeaders(h(text), { https }).findings.map((f) => f.id);
}

function finding(text: string, id: string) {
  return analyzeHeaders(h(text)).findings.find((f) => f.id === id);
}

describe('parseRawHeaders', () => {
  it('reads curl -I output with a status line and CRLF', () => {
    const parsed = parseRawHeaders(
      'HTTP/2 200\r\ncontent-type: text/html\r\nX-Frame-Options: DENY\r\n\r\n',
    );
    expect(parsed.statusLine).toBe('HTTP/2 200');
    expect(parsed.headers).toEqual([
      { name: 'content-type', value: 'text/html' },
      { name: 'X-Frame-Options', value: 'DENY' },
    ]);
  });

  it('keeps only the last response of a redirect chain', () => {
    const parsed = parseRawHeaders(
      'HTTP/1.1 301 Moved\nlocation: /b\n\nHTTP/1.1 200 OK\nserver: x\n',
    );
    expect(parsed.statusLine).toBe('HTTP/1.1 200 OK');
    expect(parsed.headers).toEqual([{ name: 'server', value: 'x' }]);
  });

  it('joins folded continuation lines and reports junk', () => {
    const parsed = parseRawHeaders(
      "content-security-policy: default-src 'self';\n  img-src *\n:status: 200\nnot a header",
    );
    expect(parsed.headers[0].value).toBe("default-src 'self'; img-src *");
    expect(parsed.ignoredLines).toEqual([':status: 200', 'not a header']);
  });
});

describe('Content-Security-Policy', () => {
  it('parses directives, first occurrence wins', () => {
    const csp = parseCsp("script-src 'self'; SCRIPT-SRC *; img-src data:");
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(['data:']);
  });

  it('reports a missing policy as missing, not as insecure', () => {
    const f = finding('x-content-type-options: nosniff', 'csp.missing');
    expect(f?.status).toBe('missing');
    expect(f?.detail).toMatch(/HTML documents/);
  });

  it("flags 'unsafe-inline' without a nonce", () => {
    expect(
      finding(
        "content-security-policy: script-src 'self' 'unsafe-inline'",
        'csp.unsafe-inline',
      )?.status,
    ).toBe('weak');
  });

  it("treats 'unsafe-inline' next to a nonce as a legacy fallback", () => {
    const list = ids(
      "content-security-policy: script-src 'nonce-abc' 'unsafe-inline'",
    );
    expect(list).toContain('csp.unsafe-inline-ignored');
    expect(list).not.toContain('csp.unsafe-inline');
  });

  it('falls back to default-src for scripts', () => {
    const list = ids("content-security-policy: default-src 'self' https:");
    expect(list).toContain('csp.broad-script-source');
    expect(list).not.toContain('csp.no-script-restriction');
  });

  it('notices a policy that does not restrict scripts at all', () => {
    expect(ids("content-security-policy: img-src 'self'")).toContain(
      'csp.no-script-restriction',
    );
  });

  it('does not call broad sources weak under strict-dynamic', () => {
    const list = ids(
      "content-security-policy: script-src 'nonce-r4nd' 'strict-dynamic' https:",
    );
    expect(list).toContain('csp.strict-dynamic');
    expect(list).not.toContain('csp.broad-script-source');
  });

  it('says a report-only policy blocks nothing', () => {
    const list = ids("content-security-policy-report-only: default-src 'self'");
    expect(list).toContain('csp.report-only');
    expect(list).toContain('csp.missing');
  });
});

describe('Strict-Transport-Security', () => {
  it('accepts a long max-age with includeSubDomains', () => {
    const f = finding(
      'strict-transport-security: max-age=63072000; includeSubDomains; preload',
      'hsts.present',
    );
    expect(f?.status).toBe('present');
    expect(f?.detail).toMatch(/2 years, subdomains included/);
  });

  it('flags max-age=0 and a missing max-age', () => {
    expect(ids('strict-transport-security: max-age=0')).toContain(
      'hsts.disabled',
    );
    expect(ids('strict-transport-security: includeSubDomains')).toContain(
      'hsts.no-max-age',
    );
  });

  it('points out preload without its requirements', () => {
    expect(ids('strict-transport-security: max-age=86400; preload')).toContain(
      'hsts.preload-requirements',
    );
  });

  it('is informational, not missing, on a plain-HTTP response', () => {
    const f = analyzeHeaders([], { https: false }).findings.find(
      (x) => x.id === 'hsts.missing',
    );
    expect(f?.status).toBe('info');
  });
});

describe('frame protection', () => {
  it('is missing when neither X-Frame-Options nor frame-ancestors is set', () => {
    expect(finding('server: x', 'xfo.missing')?.status).toBe('missing');
  });

  it('does not ask for X-Frame-Options when frame-ancestors covers it', () => {
    const list = ids("content-security-policy: frame-ancestors 'none'");
    expect(list).toContain('xfo.superseded');
    expect(list).toContain('csp.frame-ancestors');
    expect(list).not.toContain('xfo.missing');
  });

  it('flags the obsolete ALLOW-FROM', () => {
    expect(
      finding('x-frame-options: ALLOW-FROM https://a.example', 'xfo.allow-from')
        ?.status,
    ).toBe('weak');
  });
});

describe('simple headers', () => {
  it('only accepts nosniff for X-Content-Type-Options', () => {
    expect(ids('x-content-type-options: nosniff')).toContain('xcto.present');
    expect(ids('x-content-type-options: yes')).toContain('xcto.invalid');
  });

  it('uses the last recognised Referrer-Policy value', () => {
    const f = finding(
      'referrer-policy: no-referrer, strict-origin-when-cross-origin',
      'referrer.present',
    );
    expect(f?.title).toBe('Referrer-Policy: strict-origin-when-cross-origin');
    expect(ids('referrer-policy: unsafe-url')).toContain('referrer.unsafe-url');
    expect(ids('referrer-policy: bogus')).toContain('referrer.invalid');
  });

  it('describes a missing Referrer-Policy as the browser default', () => {
    expect(finding('server: x', 'referrer.missing')?.status).toBe('info');
  });

  it('parses Permissions-Policy and rejects the old Feature-Policy syntax', () => {
    expect(
      finding(
        'permissions-policy: camera=(), geolocation=(self "https://a.example")',
        'permissions.present',
      )?.detail,
    ).toBe('camera, geolocation');
    expect(ids("permissions-policy: camera 'none'")).toContain(
      'permissions.malformed',
    );
  });

  it('validates COOP / CORP / COEP values', () => {
    expect(ids('cross-origin-opener-policy: same-origin')).toContain(
      'cross-origin-opener-policy.present',
    );
    expect(ids('cross-origin-resource-policy: cross-origin')).toContain(
      'cross-origin-resource-policy.permissive',
    );
    expect(ids('cross-origin-embedder-policy: require-everything')).toContain(
      'cross-origin-embedder-policy.invalid',
    );
  });
});

describe('Cache-Control', () => {
  it('flags shared caching of a response that sets a cookie', () => {
    expect(
      ids('cache-control: public, max-age=600\nset-cookie: sid=1; HttpOnly'),
    ).toContain('cache.public-set-cookie');
  });

  it('does not flag no-store', () => {
    expect(
      ids('cache-control: no-store, public\nset-cookie: sid=1'),
    ).not.toContain('cache.public-set-cookie');
  });
});

describe('CORS', () => {
  it('distinguishes wildcard, wildcard + credentials and null', () => {
    expect(ids('access-control-allow-origin: *')).toContain('cors.wildcard');
    expect(
      ids(
        'access-control-allow-origin: *\naccess-control-allow-credentials: true',
      ),
    ).toContain('cors.wildcard-credentials');
    expect(ids('access-control-allow-origin: null')).toContain('cors.null');
  });

  it('suggests Vary: Origin for a specific origin', () => {
    expect(ids('access-control-allow-origin: https://app.example')).toContain(
      'cors.vary',
    );
    expect(
      ids(
        'access-control-allow-origin: https://app.example\nvary: Accept, Origin',
      ),
    ).not.toContain('cors.vary');
  });
});

describe('analysis shape', () => {
  it('sorts weak findings first and counts every status', () => {
    const { findings, counts } = analyzeHeaders(
      h(
        "content-security-policy: script-src 'unsafe-eval'\nx-content-type-options: nosniff",
      ),
    );
    expect(findings[0].status).toBe('weak');
    expect(counts.weak + counts.missing + counts.info + counts.present).toBe(
      findings.length,
    );
  });

  it('never produces a score', () => {
    expect(Object.keys(analyzeHeaders([]))).toEqual(['findings', 'counts']);
  });
});
