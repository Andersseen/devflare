import { describe, it, expect } from 'vitest';
import { clientOrigins, parseOAuthClients } from '../../oauth-clients';
import { hashClientSecret } from '../client-secret';

const DEVFLARE = {
  clientId: 'devflare',
  name: 'DevFlare',
  type: 'web',
  redirectURIs: ['https://devflare.andersseen.dev/api/auth/callback'],
};

const IMAGINARYX = {
  clientId: 'imaginaryx',
  name: 'Imaginaryx',
  type: 'web',
  redirectURIs: ['https://imaginaryx.example.com/auth/callback'],
};

const DEVFLARE_SECRET = 'devflare-secret-with-enough-entropy';
const IMAGINARYX_SECRET = 'imaginaryx-secret-with-enough-entropy';

const secrets = JSON.stringify({
  devflare: DEVFLARE_SECRET,
  imaginaryx: IMAGINARYX_SECRET,
});

describe('parseOAuthClients', () => {
  it('registers a confidential client with its secret', async () => {
    const { clients, errors, warnings } = await parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      secrets,
    );

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      clientId: 'devflare',
      type: 'web',
      public: false,
      tokenEndpointAuthMethod: 'client_secret_basic',
      disabled: false,
      skipConsent: true,
      requirePKCE: true,
      redirectUris: ['https://devflare.andersseen.dev/api/auth/callback'],
    });
  });

  it('stores the secret hashed, never as the configured plaintext', async () => {
    const { clients } = await parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      secrets,
    );

    expect(clients[0].clientSecret).not.toBe(DEVFLARE_SECRET);
    expect(clients[0].clientSecret).toBe(
      await hashClientSecret(DEVFLARE_SECRET),
    );
  });

  it('lets several applications coexist, each with its own redirect URIs', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([DEVFLARE, IMAGINARYX]),
      secrets,
    );

    expect(errors).toEqual([]);
    expect(clients.map((c) => c.clientId)).toEqual(['devflare', 'imaginaryx']);
    // Independent: neither can redeem a code for the other's callback.
    expect(clients[0].redirectUris).not.toContain(
      'https://imaginaryx.example.com/auth/callback',
    );
    expect(clients[1].redirectUris).toEqual([
      'https://imaginaryx.example.com/auth/callback',
    ]);
    expect(clients[0].clientSecret).not.toBe(clients[1].clientSecret);
  });

  it('registers a public client without a secret', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([{ ...IMAGINARYX, type: 'user-agent-based' }]),
      undefined,
    );

    expect(errors).toEqual([]);
    expect(clients[0]).toMatchObject({
      type: 'user-agent-based',
      public: true,
      tokenEndpointAuthMethod: 'none',
    });
    expect(clients[0].clientSecret).toBeUndefined();
  });

  it('rejects a secret configured for a public client', async () => {
    // The secret would protect nothing — a public client cannot keep one — so
    // accepting it would make the registration look stronger than it is.
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([{ ...IMAGINARYX, type: 'native' }]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/must not have an OAUTH_CLIENT_SECRETS/);
  });

  it('defaults a client with no declared type to confidential', async () => {
    const { clients } = await parseOAuthClients(
      JSON.stringify([
        {
          clientId: 'devflare',
          name: 'DevFlare',
          redirectURIs: DEVFLARE.redirectURIs,
        },
      ]),
      secrets,
    );

    expect(clients[0].type).toBe('web');
    expect(clients[0].public).toBe(false);
  });

  it('rejects a confidential client with no secret configured', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      JSON.stringify({ somebody: 'else' }),
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/need an OAUTH_CLIENT_SECRETS entry/);
  });

  it('warns about a short secret but keeps the client working', async () => {
    // Dropping the client would take a live consumer offline on deploy, which is
    // a worse outcome than the weakness being reported.
    const { clients, errors, warnings } = await parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      JSON.stringify({ devflare: 'short' }),
    );

    expect(errors).toEqual([]);
    expect(clients).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/shorter than 32 characters/);
  });

  it('rejects http redirect URIs outside loopback', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([
        { ...DEVFLARE, redirectURIs: ['http://devflare.andersseen.dev/cb'] },
      ]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/must use https/);
  });

  it('allows http on localhost so local development works', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([
        {
          ...DEVFLARE,
          redirectURIs: ['http://localhost:4200/api/auth/callback'],
        },
      ]),
      secrets,
    );

    expect(errors).toEqual([]);
    expect(clients).toHaveLength(1);
  });

  it.each([
    ['a relative path', '/api/auth/callback'],
    ['a wildcard', 'https://*.andersseen.dev/cb'],
    ['a fragment', 'https://devflare.andersseen.dev/cb#x'],
    ['embedded credentials', 'https://user:pass@devflare.andersseen.dev/cb'],
  ])('rejects %s as a redirect URI', async (_label, uri) => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([{ ...DEVFLARE, redirectURIs: [uri] }]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors).not.toEqual([]);
  });

  it('rejects an entry with no redirect URI at all', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([{ clientId: 'x', name: 'X', redirectURIs: [] }]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/non-empty array/);
  });

  it('refuses to let one client claim another client redirect URI', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([
        DEVFLARE,
        { ...IMAGINARYX, redirectURIs: DEVFLARE.redirectURIs },
      ]),
      secrets,
    );

    expect(clients.map((c) => c.clientId)).toEqual(['devflare']);
    expect(errors.join(' ')).toMatch(/already registered to "devflare"/);
  });

  it('keeps the first of two entries sharing a client id', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([DEVFLARE, { ...IMAGINARYX, clientId: 'devflare' }]),
      secrets,
    );

    expect(clients).toHaveLength(1);
    expect(clients[0].redirectUris).toEqual(DEVFLARE.redirectURIs);
    expect(errors.join(' ')).toMatch(/duplicate clientId/);
  });

  it('drops only the invalid entry, keeping the rest usable', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([{ clientId: 'broken' }, DEVFLARE]),
      secrets,
    );

    expect(clients.map((c) => c.clientId)).toEqual(['devflare']);
    expect(errors).toHaveLength(1);
  });

  it('registers nothing when unconfigured, and says nothing is wrong', async () => {
    expect(await parseOAuthClients(undefined, undefined)).toEqual({
      clients: [],
      errors: [],
      warnings: [],
    });
  });

  it('reports malformed JSON instead of throwing', async () => {
    const { clients, errors } = await parseOAuthClients('[{oops', secrets);

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/OAUTH_CLIENTS is not valid JSON/);
  });

  it('registers nobody when the secrets are unreadable', async () => {
    // Failing closed: an unparseable secret map must not quietly downgrade a
    // confidential client to one that needs no secret.
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      '{oops',
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/OAUTH_CLIENT_SECRETS is not valid JSON/);
  });

  it('reports a non-array OAUTH_CLIENTS', async () => {
    const { clients, errors } = await parseOAuthClients(
      JSON.stringify(DEVFLARE),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/must be a JSON array/);
  });

  it('never leaks a client secret into the error messages', async () => {
    const { errors, warnings } = await parseOAuthClients(
      JSON.stringify([{ clientId: 'devflare' }, { ...DEVFLARE, name: '' }]),
      secrets,
    );

    expect([...errors, ...warnings].join(' ')).not.toContain(DEVFLARE_SECRET);
  });

  describe('RP-initiated logout', () => {
    it('is off unless the client asks for it', async () => {
      const { clients } = await parseOAuthClients(
        JSON.stringify([DEVFLARE]),
        secrets,
      );

      expect(clients[0].enableEndSession).toBe(false);
      expect(clients[0].postLogoutRedirectUris).toEqual([]);
    });

    it('validates post-logout URIs as strictly as redirect URIs', async () => {
      const { clients, errors } = await parseOAuthClients(
        JSON.stringify([
          {
            ...DEVFLARE,
            enableEndSession: true,
            postLogoutRedirectURIs: ['http://devflare.andersseen.dev/bye'],
          },
        ]),
        secrets,
      );

      expect(clients).toEqual([]);
      expect(errors.join(' ')).toMatch(/must use https/);
    });

    it('registers the post-logout URIs when they are valid', async () => {
      const { clients, errors } = await parseOAuthClients(
        JSON.stringify([
          {
            ...DEVFLARE,
            enableEndSession: true,
            postLogoutRedirectURIs: ['https://devflare.andersseen.dev/bye'],
          },
        ]),
        secrets,
      );

      expect(errors).toEqual([]);
      expect(clients[0].enableEndSession).toBe(true);
      expect(clients[0].postLogoutRedirectUris).toEqual([
        'https://devflare.andersseen.dev/bye',
      ]);
    });
  });
});

describe('clientOrigins', () => {
  it('collects the distinct origins clients return to', async () => {
    const { clients } = await parseOAuthClients(
      JSON.stringify([
        {
          ...DEVFLARE,
          redirectURIs: [
            'https://devflare.andersseen.dev/api/auth/callback',
            'https://devflare.andersseen.dev/other',
          ],
        },
        IMAGINARYX,
      ]),
      secrets,
    );

    expect(clientOrigins(clients)).toEqual([
      'https://devflare.andersseen.dev',
      'https://imaginaryx.example.com',
    ]);
  });

  it('is empty when nothing is registered', () => {
    expect(clientOrigins([])).toEqual([]);
  });
});
