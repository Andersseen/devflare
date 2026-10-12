import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { describe, it, expect } from 'vitest';
import { parseOAuthClients } from '../../oauth-clients';

/**
 * The client registries actually configured in wrangler.toml — not fixtures.
 * A typo in a redirect URI there silently drops that client at boot, so each
 * environment's list is parsed here exactly as the provider parses it.
 */

interface WranglerConfig {
  vars: { OAUTH_CLIENTS: string };
  env: Record<string, { vars: { OAUTH_CLIENTS: string } }>;
}

const config = parse(
  readFileSync(join(__dirname, '../../../wrangler.toml'), 'utf8'),
) as unknown as WranglerConfig;

const registries = {
  local: config.vars.OAUTH_CLIENTS,
  production: config.env['production'].vars.OAUTH_CLIENTS,
  staging: config.env['staging'].vars.OAUTH_CLIENTS,
};

/** A secret for every configured id, so only the configuration is on trial. */
function secretsFor(clientsJson: string): string {
  const ids = (JSON.parse(clientsJson) as { clientId: string }[]).map(
    (client) => client.clientId,
  );
  return JSON.stringify(
    Object.fromEntries(
      ids.map((id) => [id, `${id}-secret-with-enough-entropy`]),
    ),
  );
}

describe('configured OAuth clients', () => {
  for (const [environment, json] of Object.entries(registries)) {
    it(`${environment}: every entry registers without errors`, async () => {
      const { clients, errors } = await parseOAuthClients(
        json,
        secretsFor(json),
      );
      expect(errors).toEqual([]);
      expect(clients.length).toBe(JSON.parse(json).length);
      for (const client of clients) {
        expect(client.requirePKCE).toBe(true);
        expect(client.grantTypes).toEqual(['authorization_code']);
      }
    });
  }

  it.each([
    ['local', 'devtools-dev', 'http://localhost:4300/api/auth/callback'],
    [
      'production',
      'devtools',
      'https://devtools.andersseen.dev/api/auth/callback',
    ],
  ] as const)(
    '%s: DevTools is its own confidential client with one exact redirect URI',
    async (environment, clientId, redirectUri) => {
      const json = registries[environment];
      const { clients } = await parseOAuthClients(json, secretsFor(json));
      const devtools = clients.find((client) => client.clientId === clientId);

      expect(devtools).toMatchObject({
        type: 'web',
        public: false,
        tokenEndpointAuthMethod: 'client_secret_basic',
        redirectUris: [redirectUri],
      });

      // Never sharing DevFlare's identity or callback.
      for (const other of clients.filter((c) => c.clientId !== clientId)) {
        expect(other.redirectUris).not.toContain(redirectUri);
        expect(other.clientId.startsWith('devtools')).toBe(false);
      }
    },
  );

  it.each([
    ['local', 'dev-radar-dev', 'http://localhost:4400/api/auth/callback'],
    [
      'production',
      'dev-radar',
      'https://devradar.andersseen.dev/api/auth/callback',
    ],
  ] as const)(
    '%s: DevRadar is its own confidential client with one exact redirect URI',
    async (environment, clientId, redirectUri) => {
      const json = registries[environment];
      const { clients } = await parseOAuthClients(json, secretsFor(json));
      const radar = clients.find((client) => client.clientId === clientId);

      expect(radar).toMatchObject({
        type: 'web',
        public: false,
        tokenEndpointAuthMethod: 'client_secret_basic',
        redirectUris: [redirectUri],
      });

      // Never sharing another app's identity or callback.
      for (const other of clients.filter((c) => c.clientId !== clientId)) {
        expect(other.redirectUris).not.toContain(redirectUri);
        expect(other.clientId.startsWith('dev-radar')).toBe(false);
      }
    },
  );

  it('drops only DevTools, not the other clients, when its secret has not been set', async () => {
    const json = registries.production;
    const secrets = JSON.parse(secretsFor(json)) as Record<string, string>;
    delete secrets['devtools'];

    const { clients, errors } = await parseOAuthClients(
      json,
      JSON.stringify(secrets),
    );

    expect(clients.map((client) => client.clientId)).toEqual([
      'devflare',
      'dev-radar',
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('devtools');
  });

  it('drops only DevRadar when its secret has not been set', async () => {
    const json = registries.production;
    const secrets = JSON.parse(secretsFor(json)) as Record<string, string>;
    delete secrets['dev-radar'];

    const { clients, errors } = await parseOAuthClients(
      json,
      JSON.stringify(secrets),
    );

    expect(clients.map((client) => client.clientId)).toEqual([
      'devflare',
      'devtools',
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('dev-radar');
  });
});
