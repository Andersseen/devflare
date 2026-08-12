import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  callDevAuthAdmin,
  DevAuthAdminError,
  resolveAdminConfig,
} from './devauth-admin';
/**
 * DevFlare's back-channel client. The properties worth pinning are about what
 * must never leak: the service token belongs in a request header and nowhere
 * else, and the path is built from the provider's origin rather than anything a
 * browser supplied.
 *
 * `h3` is deliberately not imported, matching ./oidc.ts — the event is only ever
 * read for `context`, so a structural stand-in keeps this a plain unit test.
 */

type TestEvent = Parameters<typeof callDevAuthAdmin>[0];

const TOKEN = 'service-token-with-plenty-of-entropy';

function eventWith(env: Record<string, string | undefined>): TestEvent {
  return { context: { cloudflare: { env } } } as unknown as TestEvent;
}

const ENV = {
  DEV_AUTH_URL: 'https://auth.test',
  DEV_AUTH_ADMIN_TOKEN: TOKEN,
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('resolveAdminConfig', () => {
  it('reads the Cloudflare binding', () => {
    expect(resolveAdminConfig({ cloudflare: { env: ENV } })).toEqual({
      issuer: 'https://auth.test',
      token: TOKEN,
    });
  });

  it('strips a trailing slash so paths do not double up', () => {
    const config = resolveAdminConfig({
      cloudflare: { env: { ...ENV, DEV_AUTH_URL: 'https://auth.test/' } },
    });

    expect(config.issuer).toBe('https://auth.test');
  });

  it('fails loudly when no token is configured', () => {
    // A clear 503 beats a confusing 401 from the provider.
    expect(() =>
      resolveAdminConfig({
        cloudflare: { env: { DEV_AUTH_URL: 'https://auth.test' } },
      }),
    ).toThrow(DevAuthAdminError);
  });
});

describe('callDevAuthAdmin', () => {
  it('sends the token and the acting human', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ clients: [] }), { status: 200 }),
    );

    await callDevAuthAdmin(
      eventWith(ENV),
      'owner@devflare.test',
      '/admin/clients',
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://auth.test/admin/clients');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(headers['x-devauth-actor']).toBe('owner@devflare.test');
  });

  it('always targets the configured issuer', async () => {
    // The path is ours; nothing a browser sends can point this at another host.
    const fetchMock = stubFetch(new Response('{}', { status: 200 }));

    await callDevAuthAdmin(eventWith(ENV), 'a@b.dev', '/admin/settings');

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^https:\/\/auth\.test\//);
  });

  it('surfaces the provider’s message and status', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'not an administrator' }), {
        status: 403,
      }),
    );

    await expect(
      callDevAuthAdmin(eventWith(ENV), 'a@b.dev', '/admin/clients'),
    ).rejects.toMatchObject({ message: 'not an administrator', status: 403 });
  });

  it('does not choke on an empty or non-JSON body', async () => {
    stubFetch(new Response('', { status: 200 }));

    expect(
      await callDevAuthAdmin(eventWith(ENV), 'a@b.dev', '/admin/clients'),
    ).toBeNull();
  });

  it('reports a plain-text error rather than throwing a parse error', async () => {
    stubFetch(new Response('<html>gateway</html>', { status: 502 }));

    await expect(
      callDevAuthAdmin(eventWith(ENV), 'a@b.dev', '/admin/clients'),
    ).rejects.toMatchObject({ status: 502 });
  });
});
