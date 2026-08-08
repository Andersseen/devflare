import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins/jwt';
import { oidcProvider } from 'better-auth/plugins/oidc-provider';
import { createDb } from './db';
import * as schema from './db/schema';
import { clientOrigins, parseOAuthClients } from './oauth-clients';
import type { Env } from './index';

/**
 * The algorithm the ID tokens are signed with. ES256 rather than better-auth's
 * EdDSA default: Ed25519 key generation is not available in every Workers
 * runtime version, while ECDSA P-256 is, and every OIDC client library verifies
 * ES256. The provider metadata has to advertise it explicitly — better-auth
 * hardcodes ["RS256", "EdDSA"] there.
 */
const ID_TOKEN_ALG = 'ES256';

/**
 * Builds the better-auth options. Split out from `createAuth` so tests can run
 * the exact same provider configuration against an in-memory database instead of
 * D1 — the alternative is a second, drifting copy of the config.
 */
export function createAuthOptions(
  env: Env,
  database: BetterAuthOptions['database'],
): BetterAuthOptions {
  // Comma-separated addresses allowed to create an account. Empty (the local
  // dev default) means no restriction; production sets it in wrangler.toml.
  const signupAllowlist = (env.SIGNUP_ALLOWLIST ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  // The applications allowed to authenticate through this service. See
  // ./oauth-clients.ts — registration is configuration, not an API.
  const { clients, errors } = parseOAuthClients(
    env.OAUTH_CLIENTS,
    env.OAUTH_CLIENT_SECRETS,
  );
  for (const error of errors) {
    console.error(`[oauth-clients] ${error}`);
  }

  return {
    database,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Every callbackURL is validated against this list. Consumer apps live on
    // other origins (other domains, even), so without their origins here any
    // sign-in that tries to land on one is refused with INVALID_CALLBACK_URL.
    // Registered OAuth clients are trusted by construction — their redirect
    // URIs were vetted when they were registered. The list is additive:
    // better-auth always trusts the baseURL origin on top of it.
    trustedOrigins: [
      ...clientOrigins(clients),
      ...(env.APP_URL ? [new URL(env.APP_URL).origin] : []),
    ],
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
        // In production, integrate with Resend/SendGrid/AWS SES
        // For now, log the verification URL in development
        console.log(`[Email] Verification for ${user.email}: ${url}`);
      },
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID || '',
        clientSecret: env.GITHUB_CLIENT_SECRET || '',
      },
    },
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
    // The OIDC provider reuses this URL for authorization errors it cannot
    // report to a client (bad client_id, disabled client).
    onAPIError: {
      errorURL: `${env.BETTER_AUTH_URL}/login`,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutos de cache
      },
    },
    // No cross-subdomain cookie. There used to be a `crossSubDomainCookie` block
    // here (keyed off COOKIE_DOMAIN) that widened this service's session cookie
    // to `.andersseen.dev` so the app could read it — except better-auth's option
    // is `crossSubDomainCookies`, plural, so it never did anything: TypeScript
    // accepted the misspelling because `betterAuth()`'s generic parameter
    // suppresses excess-property checks, and typing these options is what
    // surfaced it.
    //
    // Deleted rather than corrected. Consumers authenticate through the OAuth
    // flow and mint their own session, so none of them needs this cookie — and an
    // app on an unrelated domain could never have received it anyway. Enabling it
    // now would widen the cookie's scope for the first time, to serve nothing.
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    plugins: [
      // Signs the OIDC ID tokens with a rotatable key pair and publishes the
      // public half at /api/auth/jwks, so a consumer can verify an ID token
      // without sharing any secret with this service.
      jwt({
        jwks: { keyPairConfig: { alg: ID_TOKEN_ALG } },
        jwt: { issuer: env.BETTER_AUTH_URL },
      }),
      oidcProvider({
        // Where an unauthenticated authorization request is sent. This service's
        // own login page: it authenticates the user with email/password or
        // GitHub, and better-auth then resumes the authorization request from
        // the signed cookie it left behind.
        loginPage: '/login',
        trustedClients: clients,
        // OAuth 2.1: public clients cannot keep a secret, so the code exchange
        // is bound to the browser that started it instead.
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        // Registration is configuration (see ./oauth-clients.ts). Leaving the
        // dynamic registration endpoint open would let anyone create a client
        // with its own redirect URIs on a provider meant for my apps only.
        allowDynamicClientRegistration: false,
        useJWTPlugin: true,
        metadata: {
          id_token_signing_alg_values_supported: [ID_TOKEN_ALG],
          // Not advertised, because it is blocked in src/index.ts. Leaving it in
          // discovery would invite clients to try registering themselves and get
          // a 404 for their trouble. `undefined` drops the key from the JSON.
          registration_endpoint: undefined,
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
            if (signupAllowlist.length === 0) return;
            if (!signupAllowlist.includes(user.email.toLowerCase())) {
              throw new APIError('FORBIDDEN', {
                message: 'Sign-ups are currently limited to invited addresses.',
              });
            }
          },
        },
      },
    },
  };
}

export function createAuth(env: Env) {
  const db = createDb(env.DB);

  return betterAuth(
    createAuthOptions(
      env,
      drizzleAdapter(db, {
        provider: 'sqlite',
        schema,
      }),
    ),
  );
}

export type Auth = ReturnType<typeof createAuth>;
