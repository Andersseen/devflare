import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkMissingHashes,
  clearUploadTokenCache,
  createPagesDeployment,
  getUploadToken,
  jwtExpiryMs,
  uploadAssetBucket,
  type UploadAsset,
} from './pages-upload';
import { CloudflareApiError, type CloudflareConfig } from './cloudflare';

/**
 * What is worth pinning here is the shape of the four requests, because none of
 * it is guessable and all of it is invisible until a real deployment is
 * attempted: which credential each call carries, that /pages/assets/* is not
 * account-scoped, and that the deployment goes as multipart.
 */

const CONFIG: CloudflareConfig = { accountId: 'acc-1', token: 'account-token' };

function ok(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
  });
}

function fail(status: number, code: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, errors: [{ code, message }] }),
    { status },
  );
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A JWT whose payload carries `exp`, unsigned — nothing here verifies it. */
function jwtExpiringIn(seconds: number): string {
  const claims = { exp: Math.floor(Date.now() / 1000) + seconds };
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

const urlOf = (mock: ReturnType<typeof stubFetch>, call = 0) =>
  mock.mock.calls[call][0] as string;
const initOf = (mock: ReturnType<typeof stubFetch>, call = 0) =>
  mock.mock.calls[call][1] as RequestInit;
const authOf = (mock: ReturnType<typeof stubFetch>, call = 0) =>
  (initOf(mock, call).headers as Record<string, string>)['Authorization'];

beforeEach(() => clearUploadTokenCache());
afterEach(() => vi.unstubAllGlobals());

describe('jwtExpiryMs', () => {
  it('reads exp and returns it in milliseconds', () => {
    const jwt = jwtExpiringIn(600);
    const exp = jwtExpiryMs(jwt);
    expect(exp).toBeGreaterThan(Date.now() + 590_000);
    expect(exp).toBeLessThan(Date.now() + 610_000);
  });

  it.each([
    ['not a jwt at all', 'nonsense'],
    ['a jwt with no exp claim', `header.${btoa('{"sub":"x"}')}.sig`],
    ['a jwt with an unparseable payload', 'header.!!!!.sig'],
  ])('returns null for %s', (_label, jwt) => {
    // Unreadable is not fatal: the caller falls back to a short TTL and lets
    // the API decide whether the token still works.
    expect(jwtExpiryMs(jwt)).toBeNull();
  });
});

describe('getUploadToken', () => {
  it('asks the account-scoped endpoint with the account token', async () => {
    const fetchMock = stubFetch(ok({ jwt: jwtExpiringIn(600) }));
    await getUploadToken(CONFIG, 'my-site');

    expect(urlOf(fetchMock)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc-1/pages/projects/my-site/upload-token',
    );
    expect(authOf(fetchMock)).toBe('Bearer account-token');
  });

  it('encodes a project name that needs it', async () => {
    const fetchMock = stubFetch(ok({ jwt: jwtExpiringIn(600) }));
    await getUploadToken(CONFIG, 'a b/c');
    expect(urlOf(fetchMock)).toContain(
      '/pages/projects/a%20b%2Fc/upload-token',
    );
  });

  it('memoises per project, so many buckets cost one round trip', async () => {
    const fetchMock = stubFetch(ok({ jwt: jwtExpiringIn(600) }));

    const first = await getUploadToken(CONFIG, 'my-site');
    const second = await getUploadToken(CONFIG, 'my-site');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse one project's token for another", async () => {
    const fetchMock = stubFetch(
      ok({ jwt: jwtExpiringIn(600) }),
      ok({ jwt: jwtExpiringIn(600) }),
    );

    await getUploadToken(CONFIG, 'site-a');
    await getUploadToken(CONFIG, 'site-b');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches a token already inside its safety margin', async () => {
    // 30s left is less than the 60s margin: it must not be handed out.
    const fetchMock = stubFetch(
      ok({ jwt: jwtExpiringIn(30) }),
      ok({ jwt: jwtExpiringIn(600) }),
    );

    await getUploadToken(CONFIG, 'my-site');
    await getUploadToken(CONFIG, 'my-site');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses an empty token rather than uploading with nothing', async () => {
    stubFetch(ok({ jwt: '' }));
    await expect(getUploadToken(CONFIG, 'my-site')).rejects.toThrow(
      CloudflareApiError,
    );
  });
});

describe('checkMissingHashes', () => {
  it('posts to the un-prefixed path with the upload JWT', async () => {
    const fetchMock = stubFetch(ok(['aaa']));
    await checkMissingHashes('the-jwt', ['aaa', 'bbb']);

    // No /accounts/{id} — this endpoint is not account-scoped.
    expect(urlOf(fetchMock)).toBe(
      'https://api.cloudflare.com/client/v4/pages/assets/check-missing',
    );
    expect(authOf(fetchMock)).toBe('Bearer the-jwt');
    expect(JSON.parse(initOf(fetchMock).body as string)).toEqual({
      hashes: ['aaa', 'bbb'],
    });
  });

  it('returns the missing subset', async () => {
    stubFetch(ok(['bbb']));
    await expect(checkMissingHashes('jwt', ['aaa', 'bbb'])).resolves.toEqual([
      'bbb',
    ]);
  });

  it('does not call out at all for an empty list', async () => {
    const fetchMock = stubFetch();
    await expect(checkMissingHashes('jwt', [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('uploadAssetBucket', () => {
  const asset: UploadAsset = {
    key: 'e43f5a4a67f3df22d73b90ef637fee5e',
    value: 'PCFkb2N0eXBlIGh0bWw+',
    metadata: { contentType: 'text/html' },
    base64: true,
  };

  it('posts the bucket as a bare array with the JWT', async () => {
    const fetchMock = stubFetch(ok(null));
    await uploadAssetBucket('the-jwt', [asset]);

    expect(urlOf(fetchMock)).toBe(
      'https://api.cloudflare.com/client/v4/pages/assets/upload',
    );
    expect(authOf(fetchMock)).toBe('Bearer the-jwt');
    // Not wrapped in an object — the endpoint takes the array itself.
    expect(JSON.parse(initOf(fetchMock).body as string)).toEqual([asset]);
  });

  it('skips the call for an empty bucket', async () => {
    const fetchMock = stubFetch();
    await uploadAssetBucket('jwt', []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a Cloudflare refusal with its own status', async () => {
    stubFetch(fail(403, 10000, 'Authentication error'));
    await expect(uploadAssetBucket('jwt', [asset])).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('createPagesDeployment', () => {
  const manifest = { '/index.html': 'e43f5a4a67f3df22d73b90ef637fee5e' };

  it('sends multipart with the manifest and the account token', async () => {
    const fetchMock = stubFetch(
      ok({ id: 'dep-1', url: 'https://x.pages.dev' }),
    );
    await createPagesDeployment(CONFIG, 'my-site', { manifest });

    expect(urlOf(fetchMock)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc-1/pages/projects/my-site/deployments',
    );
    expect(authOf(fetchMock)).toBe('Bearer account-token');

    const body = initOf(fetchMock).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(body.get('manifest') as string)).toEqual(manifest);
  });

  it('never sets Content-Type by hand', async () => {
    // fetch derives it from the FormData, boundary included; setting it here
    // breaks the parse on Cloudflare's side.
    const fetchMock = stubFetch(ok({ id: 'dep-1' }));
    await createPagesDeployment(CONFIG, 'my-site', { manifest });

    const headers = initOf(fetchMock).headers as Record<string, string>;
    expect(Object.keys(headers)).toEqual(['Authorization']);
  });

  it('carries branch and commit message when given', async () => {
    const fetchMock = stubFetch(ok({ id: 'dep-1' }));
    await createPagesDeployment(CONFIG, 'my-site', {
      manifest,
      branch: 'main',
      commitMessage: 'deployed from DevFlare',
    });

    const body = initOf(fetchMock).body as FormData;
    expect(body.get('branch')).toBe('main');
    expect(body.get('commit_message')).toBe('deployed from DevFlare');
  });

  it('omits branch and commit message when not given', async () => {
    const fetchMock = stubFetch(ok({ id: 'dep-1' }));
    await createPagesDeployment(CONFIG, 'my-site', { manifest });

    const body = initOf(fetchMock).body as FormData;
    expect(body.get('branch')).toBeNull();
    expect(body.get('commit_message')).toBeNull();
  });

  it('attaches _headers and _redirects as files, not as manifest entries', async () => {
    const fetchMock = stubFetch(ok({ id: 'dep-1' }));
    await createPagesDeployment(CONFIG, 'my-site', {
      manifest,
      headers: '/*\n  X-Frame-Options: DENY',
      redirects: '/* /index.html 200',
    });

    const body = initOf(fetchMock).body as FormData;

    // A field would come back as a string; a file part comes back as a Blob of
    // the content's byte length. That distinction is the whole point here —
    // reading the bytes is left alone because jsdom's Blob has no text().
    const redirects = body.get('_redirects');
    const headers = body.get('_headers');

    expect(typeof redirects).not.toBe('string');
    expect(typeof headers).not.toBe('string');
    expect((redirects as Blob).size).toBe('/* /index.html 200'.length);
    expect((headers as Blob).size).toBe('/*\n  X-Frame-Options: DENY'.length);

    // And they stay out of the manifest, which is the failure that would
    // silently serve a redirects file as a text asset.
    expect(JSON.parse(body.get('manifest') as string)).toEqual(manifest);
  });

  it('sends an empty _redirects when that is what the folder held', async () => {
    // An empty file is a real state and must not be confused with absence.
    const fetchMock = stubFetch(ok({ id: 'dep-1' }));
    await createPagesDeployment(CONFIG, 'my-site', { manifest, redirects: '' });

    const body = initOf(fetchMock).body as FormData;
    expect(body.get('_redirects')).not.toBeNull();
  });

  it('forwards a Cloudflare refusal with its own status', async () => {
    stubFetch(fail(400, 8000013, 'Deployment failed'));
    await expect(
      createPagesDeployment(CONFIG, 'my-site', { manifest }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
