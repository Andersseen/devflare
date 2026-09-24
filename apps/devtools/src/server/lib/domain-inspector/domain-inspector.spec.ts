import { queryDns, resolveAddresses, type Fetcher } from './dns';
import { cdnHints, inspectDomain } from './inspect';
import {
  isIpLiteral,
  isPublicAddress,
  isPublicIPv4,
  isPublicIPv6,
  parseIPv6,
} from './ip';
import { MAX_REDIRECTS, probe } from './probe';
import { TargetError, parseTarget } from './target';

describe('IP classification', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.0.2.10',
    '198.18.0.1',
  ])('IPv4 %s is not public', (address) =>
    expect(isPublicIPv4(address)).toBe(false),
  );

  it.each(['1.1.1.1', '8.8.8.8', '172.32.0.1', '104.16.0.1', '100.128.0.1'])(
    'IPv4 %s is public',
    (address) => expect(isPublicIPv4(address)).toBe(true),
  );

  it.each([
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    '2002:7f00:1::1',
    '2001::1',
    'fe80::1%eth0',
    '3fff::1',
  ])('IPv6 %s is not public', (address) =>
    expect(isPublicIPv6(address)).toBe(false),
  );

  it.each([
    '2606:4700:4700::1111',
    '2a00:1450:4001::1',
    '::ffff:8.8.8.8',
    '[2606:4700::1]',
  ])('IPv6 %s is public', (address) =>
    expect(isPublicIPv6(address)).toBe(true),
  );

  it('parses IPv6 forms and rejects garbage', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const bad of ['1::2::3', '12345::', 'g::1', '1:2:3'])
      expect(parseIPv6(bad)).toBeNull();
    expect(isPublicAddress('not-an-ip')).toBe(false);
    expect(isIpLiteral('[::1]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});

describe('target validation', () => {
  it('accepts domains with or without a scheme', () => {
    expect(parseTarget('example.com').toString()).toBe('https://example.com/');
    expect(parseTarget(' http://Example.COM/path?x=1#frag ').toString()).toBe(
      'http://example.com/path?x=1',
    );
  });

  it.each([
    ['localhost', 'special-use'],
    ['https://localhost', 'special-use'],
    ['api.localhost', 'special-use'],
    ['printer.local', 'special-use'],
    ['metadata.google.internal', 'special-use'],
    ['127.0.0.1', 'ip-literal'],
    ['http://2130706433/', 'ip-literal'],
    ['http://0x7f.1/', 'ip-literal'],
    ['http://[::1]/', 'ip-literal'],
    ['https://example.com:8443', 'port'],
    ['https://user:pw@example.com', 'credentials'],
    ['ftp://example.com', 'protocol'],
    ['file:///etc/passwd', 'protocol'],
    ['javascript:alert(1)', 'protocol'],
    ['intranet', 'special-use'],
    ['nodots', 'hostname'],
    ['-bad-.com', 'hostname'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input, problem) => {
    expect(() => parseTarget(input)).toThrow(TargetError);
    try {
      parseTarget(input);
    } catch (error) {
      expect((error as TargetError).problem).toBe(problem);
    }
  });

  it('keeps the default port when spelled out', () => {
    expect(parseTarget('https://example.com:443').toString()).toBe(
      'https://example.com/',
    );
  });
});

/** A DoH server answering from a table: name → addresses. */
function dohFetcher(
  table: Record<string, string[] | 'nxdomain' | 'timeout'>,
): Fetcher {
  return async (input) => {
    const url = new URL(input);
    const name = url.searchParams.get('name') ?? '';
    const type = url.searchParams.get('type');
    const entry = table[name];
    if (entry === 'timeout') {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }
    if (entry === undefined || entry === 'nxdomain') {
      return Response.json({ Status: entry === 'nxdomain' ? 3 : 0 });
    }
    const wanted =
      type === 'AAAA'
        ? (a: string) => a.includes(':')
        : (a: string) => !a.includes(':');
    return Response.json({
      Status: 0,
      Answer: entry.filter(wanted).map((data) => ({
        name: `${name}.`,
        type: type === 'AAAA' ? 28 : 1,
        TTL: 60,
        data,
      })),
    });
  };
}

describe('DNS over HTTPS', () => {
  it('queries the fixed Cloudflare endpoint with the name as a parameter', async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (input, init) => {
      seen.push(input);
      expect(new Headers(init?.headers).get('accept')).toBe(
        'application/dns-json',
      );
      return Response.json({
        Status: 0,
        Answer: [
          { name: 'www.example.com.', type: 5, TTL: 300, data: 'example.com.' },
          { name: 'example.com.', type: 1, TTL: 300, data: '93.184.215.14' },
        ],
      });
    };
    const answer = await queryDns('www.example.com', 'A', fetcher);
    expect(seen).toEqual([
      'https://cloudflare-dns.com/dns-query?name=www.example.com&type=A',
    ]);
    expect(answer.records.map((r) => `${r.type} ${r.data}`)).toEqual([
      'CNAME example.com.',
      'A 93.184.215.14',
    ]);
  });

  it('reports NXDOMAIN, SERVFAIL, HTTP errors and timeouts', async () => {
    expect(
      (await queryDns('x.com', 'A', async () => Response.json({ Status: 3 })))
        .status,
    ).toBe('nxdomain');
    expect(
      (await queryDns('x.com', 'A', async () => Response.json({ Status: 2 })))
        .status,
    ).toBe('servfail');
    expect(
      (
        await queryDns(
          'x.com',
          'A',
          async () => new Response('', { status: 500 }),
        )
      ).status,
    ).toBe('error');
    expect(
      (await queryDns('x.com', 'A', dohFetcher({ 'x.com': 'timeout' }))).status,
    ).toBe('timeout');
  });

  it('resolves addresses across A and AAAA, or explains why not', async () => {
    const fetcher = dohFetcher({
      'a.com': ['1.1.1.1', '2606:4700::1'],
      'gone.com': 'nxdomain',
      'slow.com': 'timeout',
    });
    await expect(resolveAddresses('a.com', fetcher)).resolves.toEqual([
      '1.1.1.1',
      '2606:4700::1',
    ]);
    await expect(resolveAddresses('gone.com', fetcher)).rejects.toMatchObject({
      reason: 'nxdomain',
    });
    await expect(resolveAddresses('slow.com', fetcher)).rejects.toMatchObject({
      reason: 'timeout',
    });
    await expect(resolveAddresses('empty.com', fetcher)).rejects.toMatchObject({
      reason: 'no-address',
    });
  });
});

/** An HTTP world: URL → response; every fetch is recorded. */
function httpWorld(routes: Record<string, () => Response>) {
  const fetched: string[] = [];
  const fetch: Fetcher = async (input, init) => {
    expect(init?.redirect).toBe('manual');
    fetched.push(input);
    const route = routes[input];
    if (!route) throw new TypeError('connect failed');
    return route();
  };
  return { fetch, fetched };
}

const redirect =
  (to: string, status = 301) =>
  () =>
    new Response(null, { status, headers: { location: to } });

describe('probe', () => {
  const publicDns = async () => ['93.184.215.14'];

  it('follows a redirect chain and records every hop', async () => {
    const { fetch } = httpWorld({
      'http://example.com/': redirect('https://example.com/'),
      'https://example.com/': redirect('/home', 302),
      'https://example.com/home': () =>
        new Response('<html>secret body</html>', {
          status: 200,
          headers: { 'strict-transport-security': 'max-age=63072000' },
        }),
    });
    const result = await probe(new URL('http://example.com/'), {
      fetch,
      resolve: publicDns,
    });
    expect(result.failure).toBeUndefined();
    expect(result.finalUrl).toBe('https://example.com/home');
    expect(result.hops.map((h) => `${h.status} ${h.url}`)).toEqual([
      '301 http://example.com/',
      '302 https://example.com/',
      '200 https://example.com/home',
    ]);
    expect(JSON.stringify(result)).not.toContain('secret body');
  });

  it('stops after the redirect limit', async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i <= MAX_REDIRECTS + 1; i++)
      routes[`https://loop.com/${i}`] = redirect(`/${i + 1}`);
    const { fetch, fetched } = httpWorld(routes);
    const result = await probe(new URL('https://loop.com/0'), {
      fetch,
      resolve: publicDns,
    });
    expect(result.failure?.kind).toBe('too-many-redirects');
    expect(fetched).toHaveLength(MAX_REDIRECTS + 1);
  });

  it.each([
    ['a private IP', 'http://10.0.0.5/admin'],
    ['localhost', 'http://localhost/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['a metadata IP', 'http://169.254.169.254/latest/meta-data/'],
    ['a non-default port', 'https://example.com:8080/'],
    ['another protocol', 'file:///etc/passwd'],
  ])('refuses a redirect to %s without fetching it', async (_, target) => {
    const { fetch, fetched } = httpWorld({
      'https://example.com/': redirect(target),
    });
    const result = await probe(new URL('https://example.com/'), {
      fetch,
      resolve: publicDns,
    });
    expect(result.failure?.kind).toBe('blocked');
    expect(fetched).toEqual(['https://example.com/']);
  });

  it('refuses a public name that resolves to a private address', async () => {
    const { fetch, fetched } = httpWorld({});
    const result = await probe(new URL('https://internal-app.example.org/'), {
      fetch,
      resolve: async () => ['93.184.215.14', '192.168.0.10'],
    });
    expect(result.failure).toMatchObject({
      kind: 'blocked',
      message: expect.stringContaining('192.168.0.10'),
    });
    expect(fetched).toEqual([]);
  });

  it('re-resolves every hop, so a rebinding second answer is caught', async () => {
    let calls = 0;
    const rebinding = async () =>
      ++calls === 1 ? ['93.184.215.14'] : ['127.0.0.1'];
    const { fetch, fetched } = httpWorld({
      'https://rebind.com/': redirect('https://rebind.com/again'),
    });
    const result = await probe(new URL('https://rebind.com/'), {
      fetch,
      resolve: rebinding,
    });
    expect(result.failure?.kind).toBe('blocked');
    expect(fetched).toEqual(['https://rebind.com/']);
  });

  it('distinguishes timeouts, connection failures and DNS failures', async () => {
    const timeout: Fetcher = async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    };
    expect(
      (
        await probe(new URL('https://slow.com/'), {
          fetch: timeout,
          resolve: publicDns,
        })
      ).failure?.kind,
    ).toBe('timeout');
    expect(
      (
        await probe(new URL('https://down.com/'), {
          ...httpWorld({}),
          resolve: publicDns,
        })
      ).failure?.kind,
    ).toBe('network');
    const nx = dohFetcher({ 'gone.com': 'nxdomain' });
    expect(
      (await probe(new URL('https://gone.com/'), { fetch: nx })).failure?.kind,
    ).toBe('dns');
  });

  it('respects the overall deadline', async () => {
    let clock = 0;
    const { fetch } = httpWorld({ 'https://a.com/': redirect('/b') });
    const result = await probe(new URL('https://a.com/'), {
      fetch: async (input, init) => {
        clock += 30_000;
        return fetch(input, init);
      },
      resolve: publicDns,
      now: () => clock,
    });
    expect(result.failure?.kind).toBe('timeout');
  });
});

describe('inspectDomain', () => {
  it('combines DNS, the chain and the shared header analysis', async () => {
    const dns = dohFetcher({ 'example.com': ['93.184.215.14'] });
    const fetch: Fetcher = async (input, init) => {
      if (input.startsWith('https://cloudflare-dns.com/'))
        return dns(input, init);
      return new Response(null, {
        status: 200,
        headers: { 'cf-ray': '8a-AMS', 'x-content-type-options': 'nosniff' },
      });
    };
    const report = await inspectDomain('example.com', { fetch, now: () => 0 });
    expect(report.target).toMatchObject({
      hostname: 'example.com',
      url: 'https://example.com/',
    });
    expect(report.dns.map((d) => d.type)).toEqual([
      'A',
      'AAAA',
      'CNAME',
      'MX',
      'TXT',
      'NS',
    ]);
    expect(report.http.finalUrl).toBe('https://example.com/');
    expect(report.headers?.findings.map((f) => f.id)).toContain('xcto.present');
    expect(report.hints).toEqual([
      { provider: 'Cloudflare', evidence: 'cf-ray: 8a-AMS' },
    ]);
  });

  it('rejects a malformed or private target before any request', async () => {
    const fetch = vi.fn();
    await expect(inspectDomain('localhost', { fetch })).rejects.toBeInstanceOf(
      TargetError,
    );
    await expect(
      inspectDomain('not a domain', { fetch }),
    ).rejects.toBeInstanceOf(TargetError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('names CDN hints only from matching evidence', () => {
    expect(cdnHints([{ name: 'server', value: 'nginx/1.25' }])).toEqual([]);
    expect(
      cdnHints([{ name: 'X-Vercel-Id', value: 'fra1::abc' }])[0].provider,
    ).toBe('Vercel');
  });
});
