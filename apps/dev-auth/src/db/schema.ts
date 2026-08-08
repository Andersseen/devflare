import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  idToken: text('idToken'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

/**
 * Tables below back the OAuth 2.1 / OIDC provider role (better-auth's
 * `oidc-provider` and `jwt` plugins). Names and columns are dictated by those
 * plugins — the drizzle adapter looks models up by these exact keys.
 */

/**
 * Database-registered OAuth clients. The apps I run are registered through
 * configuration instead (`OAUTH_CLIENTS`, see ../oauth-clients.ts), so in this
 * phase the table stays empty — it exists because the provider falls back to it
 * for any client id it does not recognise, and a missing table would turn an
 * unknown-client lookup into a 500 instead of an `invalid_client` error.
 */
export const oauthApplication = sqliteTable('oauthApplication', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  metadata: text('metadata'),
  clientId: text('clientId').notNull().unique(),
  clientSecret: text('clientSecret'),
  redirectUrls: text('redirectUrls').notNull(),
  type: text('type').notNull(),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  userId: text('userId').references(() => user.id),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

/** Access/refresh tokens issued to a consumer app after a code exchange. */
export const oauthAccessToken = sqliteTable('oauthAccessToken', {
  id: text('id').primaryKey(),
  accessToken: text('accessToken').notNull().unique(),
  refreshToken: text('refreshToken').notNull().unique(),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp',
  }),
  clientId: text('clientId').notNull(),
  userId: text('userId').references(() => user.id),
  scopes: text('scopes').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

/**
 * Recorded consent per user/client. Registered clients are all mine and skip the
 * consent screen, but the provider still reads this table on every authorization
 * request, so it has to exist.
 */
export const oauthConsent = sqliteTable('oauthConsent', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  scopes: text('scopes').notNull(),
  consentGiven: integer('consentGiven', { mode: 'boolean' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

/**
 * ID token signing keys. The private half is encrypted with BETTER_AUTH_SECRET,
 * so rotating that secret without clearing this table breaks token signing.
 */
export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type OAuthApplication = typeof oauthApplication.$inferSelect;
export type OAuthAccessToken = typeof oauthAccessToken.$inferSelect;
export type OAuthConsent = typeof oauthConsent.$inferSelect;
export type Jwks = typeof jwks.$inferSelect;
