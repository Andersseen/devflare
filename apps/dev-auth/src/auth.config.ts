import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins/jwt';
import { oauthProvider } from '@better-auth/oauth-provider';
import type { DBAdapterInstance } from 'better-auth/types';
import { createDb } from './db';
import * as schema from './db/schema';
import { withHybridClients } from './client-registry';
import { getProviderSettings, maySignUp } from './lib/provider-settings';
import { hashClientSecret, verifyClientSecret } from './lib/client-secret';
import {
  clientOrigins,
  parseOAuthClients,
  type ParsedClientRegistry,
} from './oauth-clients';
import type { Env } from './index';

/**
 * The algorithm the ID and access tokens are signed with. ES256 rather than the
 * EdDSA default: Ed25519 key generation is not available in every Workers
 * runtime version, while ECDSA P-256 is, and every OIDC client library verifies
 * ES256. The provider advertises whatever is configured here in its discovery
 * document, so this is the only place it has to be stated.
 */
const ID_TOKEN_ALG = 'ES256';

/**
 * The scopes a client may ask for. `openid` is what makes this an OIDC provider
 * rather than a bare OAuth server; `offline_access` is what a consumer requests
 * when it wants a refresh token.
 */
const SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;

/**
 * Parsing the client registry hashes each configured secret, so it is done once
 * per isolate instead of on every request — `createAuth` runs per request.
 *
 * A single-entry memo is enough: a Worker isolate only ever sees one env. The
 * raw configuration strings are the cache key, so editing either one in
 * wrangler (a redeploy, a new isolate) re-parses rather than serving a stale
 * registry.
 */
let registryCache:
  | {
      clients?: string;
      secrets?: string;
      parsed: Promise<ParsedClientRegistry>;
    }
  | undefined;

export function getClientRegistry(env: Env): Promise<ParsedClientRegistry> {
  if (
    registryCache &&
    registryCache.clients === env.OAUTH_CLIENTS &&
    registryCache.secrets === env.OAUTH_CLIENT_SECRETS
  ) {
    return registryCache.parsed;
  }

  const parsed = parseOAuthClients(
    env.OAUTH_CLIENTS,
    env.OAUTH_CLIENT_SECRETS,
  ).then((registry) => {
    // Logged once per isolate rather than once per request. Neither list ever
    // contains a secret — see ./oauth-clients.ts.
    for (const error of registry.errors) {
      console.error(`[oauth-clients] ${error}`);
    }
    for (const warning of registry.warnings) {
      console.warn(`[oauth-clients] ${warning}`);
    }
    return registry;
  });

  registryCache = {
    clients: env.OAUTH_CLIENTS,
    secrets: env.OAUTH_CLIENT_SECRETS,
    parsed,
  };
  return parsed;
}

/** Test seam: drops the memo so a spec can change OAUTH_CLIENTS between cases. */
export function resetClientRegistryCache(): void {
  registryCache = undefined;
}

/**
 * Builds the better-auth options. Split out from `createAuth` so tests can run
 * the exact same provider configuration against an in-memory database instead of
 * D1 — the alternative is a second, drifting copy of the config.
 */
export async function createAuthOptions(env: Env, database: DBAdapterInstance) {
  // Who may sign up, and the GitHub credentials — resolved from D1 first and the
  // environment second. With no rows this is exactly the previous behaviour;
  // see ./lib/provider-settings.ts for how the empty allowlist case differs
  // between "configured as empty" and "not configured".
  const settings = await getProviderSettings(env);

  // The applications allowed to authenticate through this service. See
  // ./oauth-clients.ts — registration is configuration, not an API.
  const { clients } = await getClientRegistry(env);

  // `satisfies` rather than a `: BetterAuthOptions` return annotation. Both
  // reject a misspelled option — that is how a `crossSubDomainCookie` typo, which
  // TypeScript had been silently accepting, was finally caught — but only
  // `satisfies` keeps the concrete plugin types, and `createAuth`'s callers need
  // them: the discovery endpoints are server-only, so src/index.ts reaches them
  // through `auth.api.getOpenIdConfig` rather than through the HTTP handler.
  const options = {
    // The provider reads registered clients through the adapter; this wrapper
    // answers those reads from the configuration above first and from D1 second,
    // and refuses any write aimed at a configured client. See ./client-registry.ts.
    database: withHybridClients(database, clients),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Every callbackURL is validated against this list. Consumer apps live on
    // other origins (other domains, even), so without their origins here any
    // sign-in that tries to land on one is refused with INVALID_CALLBACK_URL.
    // Registered OAuth clients are trusted by construction — their redirect
    // URIs were vetted when they were registered. The list is additive:
    // better-auth always trusts the baseURL origin on top of it, which is what
    // covers this service's own pages now that there is no APP_URL.
    trustedOrigins: clientOrigins(clients),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Nothing can deliver the verification mail yet (see sendVerificationEmail
      // below), so requiring it would create accounts that can never sign in.
      // Re-enable this and sendOnSignUp together with a real email provider —
      // access is gated by SIGNUP_ALLOWLIST in the meantime.
      requireEmailVerification: false,
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // There is no transactional email provider wired up. This logs rather
        // than sends, which is why requireEmailVerification is off above.
        console.log(`[Email] Verification for ${user.email}: ${url}`);
      },
    },
    // Omitted entirely when GitHub is not fully configured or has been switched
    // off from the admin API. Passing empty strings instead would advertise a
    // provider whose button fails at the redirect, and log a warning per request.
    socialProviders: settings.github.enabled
      ? {
          github: {
            clientId: settings.github.clientId,
            clientSecret: settings.github.clientSecret,
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // GitHub only hands back verified primary addresses, so treating it as
        // trusted is what lets an existing account adopt it as a second method.
        trustedProviders: ['github'],
        // Must be false here. It defaults to TRUE, and with email verification
        // switched off (no provider can send the mail) every locally created
        // account sits at emailVerified = 0 forever — so the default silently
        // refuses to link GitHub to any of them, bouncing the user back to the
        // login form with no explanation.
        requireLocalEmailVerified: false,
      },
    },
    // Failed callbacks default to `${baseURL}/error`, which this service does
    // not serve — the browser ended up back on /login with the reason stripped,
    // which is what made "GitHub does nothing" so hard to read. Send failures to
    // the login page instead, where the ?error= param is surfaced as a toast.
    // The provider reuses this URL for authorization errors it cannot report to
    // a client (bad client_id, disabled client).
    onAPIError: {
      errorURL: `${env.BETTER_AUTH_URL}/login`,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    // No cross-subdomain cookie, deliberately. Consumers authenticate through
    // the OAuth flow and mint their own session, so none of them needs this
    // service's cookie — and an app on an unrelated domain could never have
    // received it anyway. It stays host-only to this Worker.
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    plugins: [
      // Signs the tokens with a rotatable key pair and publishes the public half
      // at /api/auth/jwks, so a consumer can verify an ID token without sharing
      // any secret with this service. The provider reads the algorithm from here
      // for its discovery document.
      jwt({
        jwks: { keyPairConfig: { alg: ID_TOKEN_ALG } },
        jwt: { issuer: env.BETTER_AUTH_URL },
      }),
      oauthProvider({
        scopes: [...SCOPES],
        // Where an unauthenticated authorization request is sent. This service's
        // own login page: it authenticates the user with email/password or
        // GitHub, and the provider resumes the authorization request from the
        // signed `oauth_query` the page hands back.
        loginPage: '/login',
        // Required by the plugin, and unreachable for every client registered
        // today: the registry marks them all `skipConsent` because they are all
        // my own applications. It is wired up rather than pointed at a dead URL
        // so that a future non-first-party client fails closed at a real screen
        // instead of a 404.
        consentPage: '/consent',
        signup: { page: '/signup' },
        // Authorization code only. `client_credentials` would let a client act
        // with no user involved, which nothing here needs, and leaving it out of
        // the advertised metadata keeps the surface honest. The plugin still
        // issues refresh tokens to an authorization-code client that asked for
        // the `offline_access` scope.
        grantTypes: ['authorization_code', 'refresh_token'],
        // Registration is configuration (see ./oauth-clients.ts). Both flags off
        // means the plugin serves no registration endpoint and advertises none;
        // src/index.ts blocks the paths anyway, and the client store rejects
        // writes, so this is the first of three independent locks.
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        // Denies every client CRUD action, for every caller, including a
        // signed-in one. Without this the plugin only asks whether the *session*
        // is valid before letting it create a client.
        clientPrivileges: async () => false,
        // The registry hands over already-hashed secrets and never the
        // plaintext, so the provider is told how to hash and compare rather than
        // being left to assume a format. See ./lib/client-secret.ts.
        storeClientSecret: {
          hash: hashClientSecret,
          verify: verifyClientSecret,
        },
        // Both discovery documents are served from this Worker's root in
        // src/index.ts, which is where a client looks for them given the issuer
        // is the origin. The plugin cannot tell that from inside its base path.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          // Fires for every account creation path, email sign-up and OAuth
          // alike, so one check covers both. Throwing here aborts the insert;
          // returning false would too, but without a message the caller can read.
          before: async (user) => {
            if (maySignUp(user.email, settings)) return;
            throw new APIError('FORBIDDEN', {
              message: 'Sign-ups are currently limited to invited addresses.',
            });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;

  return options;
}

export async function createAuth(env: Env) {
  const db = createDb(env.DB);

  return betterAuth(
    await createAuthOptions(
      env,
      drizzleAdapter(db, {
        provider: 'sqlite',
        schema,
      }),
    ),
  );
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
