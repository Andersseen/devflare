import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cfFetch,
  clearCloudflareCache,
  CloudflareApiError,
  isCloudflareConfigured,
  resolveCloudflareConfig,
  toDeploymentSummary,
  type CloudflareConfig,
  type PagesDeployment,
} from './cloudflare';

/**
 * The properties worth pinning are about a credential that can see the whole
 * account: it belongs in a request header and nowhere else, the URL is built
 * from configuration rather than from anything a browser sent, and a refusal
 * upstream must arrive as a refusal rather than as a silent empty list.
 */

const CONFIG: CloudflareConfig = { accountId: 'acc-1', token: 'cf-token' };

const ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'acc-1',
  CLOUDFLARE_API_TOKEN: 'cf-token',
};

function ok(result: unknown) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
  });
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clearCloudflareCache();
  // `resolveCloudflareConfig` falls back to process.env by design, for runtimes
  // that are not Cloudflare. The deploy workflow exports both of these to every
  // job, so on CI the "no credential" cases would read the runner's real ones
  // and assert the opposite of what they mean. Pinning them empty here keeps
  // these tests about the code rather than about where they happen to run.
  vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', undefined);
  vi.stubEnv('CLOUDFLARE_API_TOKEN', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveCloudflareConfig', () => {
  it('reads the Cloudflare binding', () => {
    expect(resolveCloudflareConfig({ cloudflare: { env: ENV } })).toEqual(
      CONFIG,
    );
  });

  it('fails with 503 when the credential is incomplete', () => {
    // The caller is fine; this server is missing configuration.
    expect(() =>
      resolveCloudflareConfig({
        cloudflare: { env: { CLOUDFLARE_ACCOUNT_ID: 'acc-1' } },
      }),
    ).toThrow(CloudflareApiError);

    expect(() => resolveCloudflareConfig({ cloudflare: { env: {} } })).toThrow(
      /not configured/,
    );
  });

  it('reports configuration without throwing', () => {
    expect(isCloudflareConfigured({ cloudflare: { env: ENV } })).toBe(true);
    expect(isCloudflareConfigured({ cloudflare: { env: {} } })).toBe(false);
  });
});

describe('cfFetch', () => {
  it('sends the token as a bearer and scopes the path to the account', async () => {
    const fetchMock = stubFetch(ok([{ id: 'devflare' }]));

    await cfFetch(CONFIG, '/workers/scripts');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc-1/workers/scripts',
    );
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer cf-token',
    );
  });

  it('unwraps the result out of the envelope', async () => {
    stubFetch(ok([{ id: 'devflare' }]));

    expect(await cfFetch(CONFIG, '/workers/scripts')).toEqual([
      { id: 'devflare' },
    ]);
  });

  it('turns success:false into an error naming the upstream code', async () => {
    // A 200 with success:false is how Cloudflare reports several failures; it
    // must not reach a page as a valid empty payload.
    stubFetch(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10000, message: 'Authentication error' }],
        }),
        { status: 200 },
      ),
    );

    await expect(cfFetch(CONFIG, '/workers/scripts')).rejects.toMatchObject({
      message: 'Authentication error (Cloudflare error 10000)',
      status: 502,
    });
  });

  it('preserves the upstream status when the request is refused', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10001, message: 'Insufficient permissions' }],
        }),
        { status: 403 },
      ),
    );

    await expect(cfFetch(CONFIG, '/r2/buckets')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('reports a non-JSON body rather than throwing a parse error', async () => {
    stubFetch(new Response('<html>gateway</html>', { status: 502 }));

    await expect(cfFetch(CONFIG, '/pages/projects')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('reports an unreachable API without leaking the URL or the token', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('connect ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cfFetch(CONFIG, '/pages/projects')).rejects.toMatchObject({
      message: 'Could not reach the Cloudflare API',
      status: 504,
    });
  });

  it('serves a repeated GET from the memo', async () => {
    const fetchMock = stubFetch(ok(['first']));

    await cfFetch(CONFIG, '/pages/projects');
    const second = await cfFetch(CONFIG, '/pages/projects');

    expect(second).toEqual(['first']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('goes back to the API when asked to refresh', async () => {
    const fetchMock = stubFetch(ok(['first']), ok(['second']));

    await cfFetch(CONFIG, '/pages/projects');

    expect(await cfFetch(CONFIG, '/pages/projects', { refresh: true })).toEqual(
      ['second'],
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never serves a write from the memo, and drops it afterwards', async () => {
    // A deploy invalidates more listings than the one path it was posted to.
    const fetchMock = stubFetch(
      ok(['before']),
      ok({ id: 'd1' }),
      ok(['after']),
    );

    await cfFetch(CONFIG, '/pages/projects');
    await cfFetch(CONFIG, '/pages/projects/site/deployments', {
      method: 'POST',
    });

    expect(await cfFetch(CONFIG, '/pages/projects')).toEqual(['after']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('toDeploymentSummary', () => {
  const deployment = {
    id: 'deploy-1',
    short_id: 'deploy1',
    url: 'https://deploy1.site.pages.dev',
    environment: 'production',
    created_on: '2026-08-01T10:00:00Z',
    latest_stage: {
      name: 'deploy',
      status: 'success',
      started_on: null,
      ended_on: null,
    },
    deployment_trigger: {
      metadata: {
        branch: 'main',
        commit_hash: 'abc123',
        commit_message: 'feat: ship it\n\nlonger body',
      },
    },
  } satisfies PagesDeployment;

  it('flattens the stage and the trigger metadata', () => {
    expect(toDeploymentSummary(deployment)).toMatchObject({
      id: 'deploy-1',
      status: 'success',
      stage: 'deploy',
      branch: 'main',
      commit: 'abc123',
      commitMessage: 'feat: ship it',
    });
  });

  it('survives a deployment with no stage or trigger', () => {
    // Direct-upload projects have no git trigger at all.
    const summary = toDeploymentSummary({
      ...deployment,
      latest_stage: null,
      deployment_trigger: undefined,
    });

    expect(summary).toMatchObject({
      status: 'unknown',
      stage: 'unknown',
      branch: null,
      commit: null,
      commitMessage: null,
    });
  });
});
