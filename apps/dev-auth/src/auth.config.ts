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
