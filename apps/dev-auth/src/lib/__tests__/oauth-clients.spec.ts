import { describe, it, expect } from 'vitest';
import { clientOrigins, parseOAuthClients } from '../../oauth-clients';

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

const secrets = JSON.stringify({
  devflare: 'devflare-secret',
  imaginaryx: 'imaginaryx-secret',
});

describe('parseOAuthClients', () => {
  it('registers a confidential client with its secret', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      secrets,
    );

    expect(errors).toEqual([]);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      clientId: 'devflare',
      clientSecret: 'devflare-secret',
      type: 'web',
      disabled: false,
      skipConsent: true,
      redirectUrls: ['https://devflare.andersseen.dev/api/auth/callback'],
    });
  });

  it('lets several applications coexist, each with its own redirect URIs', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([DEVFLARE, IMAGINARYX]),
      secrets,
    );

    expect(errors).toEqual([]);
    expect(clients.map((c) => c.clientId)).toEqual(['devflare', 'imaginaryx']);
    // Independent: neither can redeem a code for the other's callback.
    expect(clients[0].redirectUrls).not.toContain(
      'https://imaginaryx.example.com/auth/callback',
    );
    expect(clients[1].redirectUrls).toEqual([
      'https://imaginaryx.example.com/auth/callback',
    ]);
    expect(clients[0].clientSecret).not.toBe(clients[1].clientSecret);
  });

  it('registers a public client without a secret', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([{ ...IMAGINARYX, type: 'public' }]),
      undefined,
    );

    expect(errors).toEqual([]);
    expect(clients[0].type).toBe('public');
    expect(clients[0].clientSecret).toBeUndefined();
  });

  it('defaults a client with no declared type to confidential', () => {
    const { clients } = parseOAuthClients(
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
  });

  it('rejects a confidential client with no secret configured', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([DEVFLARE]),
      JSON.stringify({ somebody: 'else' }),
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/need an OAUTH_CLIENT_SECRETS entry/);
  });

  it('rejects http redirect URIs outside loopback', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([
        { ...DEVFLARE, redirectURIs: ['http://devflare.andersseen.dev/cb'] },
      ]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/must use https/);
  });

  it('allows http on localhost so local development works', () => {
    const { clients, errors } = parseOAuthClients(
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
  ])('rejects %s as a redirect URI', (_label, uri) => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([{ ...DEVFLARE, redirectURIs: [uri] }]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors).not.toEqual([]);
  });

  it('rejects an entry with no redirect URI at all', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([{ clientId: 'x', name: 'X', redirectURIs: [] }]),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/non-empty array/);
  });

  it('keeps the first of two entries sharing a client id', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([DEVFLARE, { ...IMAGINARYX, clientId: 'devflare' }]),
      secrets,
    );

    expect(clients).toHaveLength(1);
    expect(clients[0].redirectUrls).toEqual(DEVFLARE.redirectURIs);
    expect(errors.join(' ')).toMatch(/duplicate clientId/);
  });

  it('drops only the invalid entry, keeping the rest usable', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify([{ clientId: 'broken' }, DEVFLARE]),
      secrets,
    );

    expect(clients.map((c) => c.clientId)).toEqual(['devflare']);
    expect(errors).toHaveLength(1);
  });

  it('registers nothing when unconfigured, and says nothing is wrong', () => {
    expect(parseOAuthClients(undefined, undefined)).toEqual({
      clients: [],
      errors: [],
    });
  });

  it('reports malformed JSON instead of throwing', () => {
    const { clients, errors } = parseOAuthClients('[{oops', secrets);

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/OAUTH_CLIENTS is not valid JSON/);
  });

  it('reports a non-array OAUTH_CLIENTS', () => {
    const { clients, errors } = parseOAuthClients(
      JSON.stringify(DEVFLARE),
      secrets,
    );

    expect(clients).toEqual([]);
    expect(errors.join(' ')).toMatch(/must be a JSON array/);
  });

  it('never leaks a client secret into the error messages', () => {
    const { errors } = parseOAuthClients(
      JSON.stringify([{ clientId: 'devflare' }]),
      secrets,
    );

    expect(errors.join(' ')).not.toContain('devflare-secret');
  });
});

describe('clientOrigins', () => {
  it('collects the distinct origins clients return to', () => {
    const { clients } = parseOAuthClients(
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
