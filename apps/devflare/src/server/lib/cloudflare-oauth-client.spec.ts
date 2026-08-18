import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// This project's tests run in jsdom, which has no SubtleCrypto — and sealing a
// secret is half of what is under test here. Node's own implementation is the
// same Web Crypto the Worker runtime provides.
vi.stubGlobal('crypto', webcrypto);

/**
 * The decisions this module makes are all about *which* client wins and what
 * the browser is allowed to know about it. Both have teeth: falling back to the
 * environment after a key rotation would make the rotation look successful
 * while running on a different client, and a view that leaked the secret would
 * undo the reason it is sealed at all.
 *
 * The database is mocked down to the one row this table ever holds — what is
 * under test is the resolution, not db0.
 */
const state = vi.hoisted(() => ({
  row: null as {
    id: string;
    clientId: string;
    clientSecret: string;
    updatedBy: string;
    updatedAt: string;
  } | null,
  readFails: false,
}));

vi.mock('../db', () => ({
  db: {
    sql: async () => {
      if (state.readFails) throw new Error('no such table');
      return { rows: state.row ? [state.row] : [] };
    },
  },
}));

const { oauthClientView, resolveCloudflareOAuthConfig } = await import(
  './cloudflare-oauth-client'
);
const { seal } = await import('./secret-box');

const KEY = 'dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNA==';
const OTHER_KEY = 'b3RoZXIta2V5LW90aGVyLWtleS1vdGhlci1rZXktMDA=';
const REDIRECT =
  'https://devflare.andersseen.dev/api/v1/cloud/connect/callback';

function context(env: Record<string, string | undefined>) {
  return { cloudflare: { env } };
}

const DEPLOYED = {
  CLOUDFLARE_OAUTH_CLIENT_ID: 'from-the-environment',
  CLOUDFLARE_OAUTH_CLIENT_SECRET: 'env-secret',
  CLOUDFLARE_OAUTH_REDIRECT_URI: REDIRECT,
  SECRET_ENCRYPTION_KEY: KEY,
};

async function storeRow(clientSecret = 'stored-secret', key = KEY) {
  state.row = {
    id: 'default',
    clientId: 'from-the-database',
    clientSecret: await seal(clientSecret, key),
    updatedBy: 'user-1',
    updatedAt: '2026-08-18T09:00:00.000Z',
  };
}

beforeEach(() => {
  state.row = null;
  state.readFails = false;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('resolveCloudflareOAuthConfig', () => {
  it('prefers the stored client over the deployed one', async () => {
    await storeRow();

    expect(await resolveCloudflareOAuthConfig(context(DEPLOYED))).toEqual({
      clientId: 'from-the-database',
      clientSecret: 'stored-secret',
      redirectUri: REDIRECT,
    });
  });

  it('falls back to the environment when nothing is stored', async () => {
    expect(await resolveCloudflareOAuthConfig(context(DEPLOYED))).toEqual({
      clientId: 'from-the-environment',
      clientSecret: 'env-secret',
      redirectUri: REDIRECT,
    });
  });

  it('falls back to the environment when the table cannot be read', async () => {
    // A deployment whose migration has not been applied yet must keep working
    // on the variables it was deployed with.
    state.readFails = true;

    expect(await resolveCloudflareOAuthConfig(context(DEPLOYED))).toEqual({
      clientId: 'from-the-environment',
      clientSecret: 'env-secret',
      redirectUri: REDIRECT,
    });
  });

  it('refuses rather than falling back when the stored secret cannot be opened', async () => {
    // The point of the refusal: a rotated SECRET_ENCRYPTION_KEY must not look
    // like it worked while the server quietly runs on a different client —
    // which could not renew the stored grant anyway.
    await storeRow('stored-secret', OTHER_KEY);

    expect(await resolveCloudflareOAuthConfig(context(DEPLOYED))).toBeNull();
  });

  it('refuses a stored client with no redirect URI to come back to', async () => {
    await storeRow();

    const config = await resolveCloudflareOAuthConfig(
      context({ ...DEPLOYED, CLOUDFLARE_OAUTH_REDIRECT_URI: undefined }),
    );

    expect(config).toBeNull();
  });

  it('has no client at all when neither source is configured', async () => {
    expect(await resolveCloudflareOAuthConfig(context({}))).toBeNull();
  });
});

describe('oauthClientView', () => {
  it('reports a stored client without carrying its secret', async () => {
    await storeRow();

    const view = await oauthClientView(context(DEPLOYED));

    expect(view).toEqual({
      clientId: 'from-the-database',
      source: 'database',
      secretConfigured: true,
      secretUnreadable: false,
      redirectUri: REDIRECT,
      encryptionKeyConfigured: true,
      updatedAt: '2026-08-18T09:00:00.000Z',
    });
    expect(JSON.stringify(view)).not.toContain('stored-secret');
  });

  it('names an unreadable secret instead of reporting it configured', async () => {
    await storeRow('stored-secret', OTHER_KEY);

    const view = await oauthClientView(context(DEPLOYED));

    expect(view.secretUnreadable).toBe(true);
    expect(view.secretConfigured).toBe(false);
  });

  it('reports the deployed client when nothing is stored', async () => {
    const view = await oauthClientView(context(DEPLOYED));

    expect(view.source).toBe('environment');
    expect(view.clientId).toBe('from-the-environment');
    expect(view.secretConfigured).toBe(true);
  });

  it('reports nothing configured, and says the key is missing', async () => {
    const view = await oauthClientView(context({}));

    expect(view).toMatchObject({
      clientId: null,
      source: 'none',
      secretConfigured: false,
      redirectUri: null,
      encryptionKeyConfigured: false,
    });
  });
});
