import { describe, it, expect } from 'vitest';
import { toRegisteredClient, type OAuthClientRow } from '../client-row';

/**
 * Rows arrive from D1, written by the admin API rather than by a reviewed diff,
 * so the point of these tests is the refusals: what a row is *not* allowed to
 * talk the provider into.
 */

const VALID: OAuthClientRow = {
  clientId: 'imageryx',
  name: 'Imageryx',
  type: 'web',
  clientSecret: 'stored-hash-of-the-secret',
  redirectUris: JSON.stringify([
    'https://imageryx-dashboard.pages.dev/proxy/auth/callback',
  ]),
};

describe('toRegisteredClient', () => {
  it('normalises a valid row', () => {
    const client = toRegisteredClient(VALID);

    expect(client?.clientId).toBe('imageryx');
    expect(client?.redirectUris).toEqual([
      'https://imageryx-dashboard.pages.dev/proxy/auth/callback',
    ]);
    expect(client?.tokenEndpointAuthMethod).toBe('client_secret_basic');
    expect(client?.public).toBe(false);
  });

  it('accepts a list that arrives already parsed', () => {
    const client = toRegisteredClient({
      ...VALID,
      redirectUris: [
        'https://imageryx-dashboard.pages.dev/proxy/auth/callback',
      ],
    });

    expect(client?.redirectUris).toHaveLength(1);
  });

  it('forces PKCE on however the row is written', () => {
    const client = toRegisteredClient({
      ...VALID,
      requirePKCE: false,
    } as OAuthClientRow);

    expect(client?.requirePKCE).toBe(true);
  });

  it('never widens the grant types from a row', () => {
    const client = toRegisteredClient({
      ...VALID,
      grantTypes: JSON.stringify(['authorization_code', 'client_credentials']),
    } as OAuthClientRow);

    expect(client?.grantTypes).toEqual(['authorization_code']);
    expect(client?.responseTypes).toEqual(['code']);
  });

  it('defaults skipConsent to false, unlike the configuration path', () => {
    expect(toRegisteredClient(VALID)?.skipConsent).toBe(false);
    expect(toRegisteredClient({ ...VALID, skipConsent: 1 })?.skipConsent).toBe(
      true,
    );
  });

  it('reads SQLite integers as booleans', () => {
    expect(
      toRegisteredClient({ ...VALID, enableEndSession: 1 })?.enableEndSession,
    ).toBe(true);
  });

  it.each([
    ['a fragment', 'https://app.test/cb#x'],
    ['credentials in the URL', 'https://user:pw@app.test/cb'],
    ['a wildcard host', 'https://*.app.test/cb'],
    ['plain http off loopback', 'http://app.test/cb'],
    ['a relative URL', '/cb'],
  ])('drops a row whose redirect URI has %s', (_label, uri) => {
    expect(
      toRegisteredClient({ ...VALID, redirectUris: JSON.stringify([uri]) }),
    ).toBeNull();
  });

  it('allows loopback http, which is what local development needs', () => {
    const client = toRegisteredClient({
      ...VALID,
      redirectUris: JSON.stringify([
        'http://localhost:5173/proxy/auth/callback',
      ]),
    });

    expect(client?.redirectUris).toEqual([
      'http://localhost:5173/proxy/auth/callback',
    ]);
  });

  it.each([
    ['no redirect URIs', { redirectUris: JSON.stringify([]) }],
    ['unparseable redirect URIs', { redirectUris: 'not json' }],
    ['a blank client id', { clientId: '  ' }],
    ['a client id with spaces', { clientId: 'two words' }],
    ['no secret on a confidential client', { clientSecret: null }],
    [
      'a secret on a public client',
      { type: 'native', clientSecret: 'should-not-exist' },
    ],
    ['a disabled flag', { disabled: 1 }],
  ])('drops a row with %s', (_label, patch) => {
    expect(toRegisteredClient({ ...VALID, ...patch })).toBeNull();
  });

  it('registers a public client that correctly has no secret', () => {
    const client = toRegisteredClient({
      ...VALID,
      type: 'native',
      clientSecret: null,
    });

    expect(client?.public).toBe(true);
    expect(client?.tokenEndpointAuthMethod).toBe('none');
  });

  it('returns null for a missing row', () => {
    expect(toRegisteredClient(null)).toBeNull();
    expect(toRegisteredClient(undefined)).toBeNull();
  });
});
