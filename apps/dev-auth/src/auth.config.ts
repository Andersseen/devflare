import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDb } from './db';
import * as schema from './db/schema';
import type { Env } from './index';

export function createAuth(env: Env) {
  const db = createDb(env.DB);

  // Comma-separated addresses allowed to create an account. Empty (the local
  // dev default) means no restriction; production sets it in wrangler.toml.
  const signupAllowlist = (env.SIGNUP_ALLOWLIST ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Every callbackURL is validated against this list. The app lives on a
    // different subdomain, so without its origin here any sign-in that tries to
    // land on the app is refused with INVALID_CALLBACK_URL. The list is
    // additive — better-auth always trusts the baseURL origin on top of it.
    trustedOrigins: env.APP_URL ? [new URL(env.APP_URL).origin] : [],
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
    onAPIError: {
      errorURL: `${env.BETTER_AUTH_URL}/login`,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutos de cache
      },
    },
    // Cross-subdomain cookies for multi-app setup
    advanced: {
      crossSubDomainCookie: {
        enabled: !!env.COOKIE_DOMAIN,
        domain: env.COOKIE_DOMAIN,
      },
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
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
  });
}

export type Auth = ReturnType<typeof createAuth>;
