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
 * Tables below back the OAuth 2.1 / OIDC provider role
 * (`@better-auth/oauth-provider` and better-auth's `jwt` plugin). Names and
 * columns are dictated by those plugins — the drizzle adapter looks models up by
 * these exact keys, so renaming anything here silently breaks the provider.
 *
 * Array and JSON columns are plain `text()`, NOT drizzle's `{ mode: 'json' }`.
 * better-auth's drizzle adapter already serialises a `string[]` field to a JSON
 * string before handing it over, so asking drizzle to encode it again stores a
 * doubly-encoded value: `"[\"openid\"]"` instead of `["openid"]`. It survives a
 * round trip — both layers apply symmetric transforms — which is exactly why it
 * is worth stating: the damage is invisible from the application and only shows
 * up when something else reads the column.
 */

/**
 * Registered OAuth clients. Intentionally EMPTY.
 *
 * The apps allowed to authenticate here are registered in configuration
 * (`OAUTH_CLIENTS`, see ../oauth-clients.ts) and served to the provider from
 * there by ../client-registry.ts, which never reads or writes this table. It is
 * declared so the schema matches the plugin's expectations and so an unknown
 * client id fails as "no such client" rather than as a SQL error.
 */
export const oauthClient = sqliteTable('oauthClient', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull().unique(),
  clientSecret: text('clientSecret'),
  disabled: integer('disabled', { mode: 'boolean' }).default(false),
  skipConsent: integer('skipConsent', { mode: 'boolean' }),
  enableEndSession: integer('enableEndSession', { mode: 'boolean' }),
  subjectType: text('subjectType'),
  scopes: text('scopes'),
  userId: text('userId').references(() => user.id),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  name: text('name'),
  uri: text('uri'),
  icon: text('icon'),
  contacts: text('contacts'),
  tos: text('tos'),
  policy: text('policy'),
  softwareId: text('softwareId'),
  softwareVersion: text('softwareVersion'),
  softwareStatement: text('softwareStatement'),
  redirectUris: text('redirectUris').notNull(),
  postLogoutRedirectUris: text('postLogoutRedirectUris'),
  tokenEndpointAuthMethod: text('tokenEndpointAuthMethod'),
  grantTypes: text('grantTypes'),
  responseTypes: text('responseTypes'),
  public: integer('public', { mode: 'boolean' }),
  type: text('type'),
  requirePKCE: integer('requirePKCE', { mode: 'boolean' }),
  referenceId: text('referenceId'),
  metadata: text('metadata'),
});

/**
 * Refresh tokens, issued when a client requests the `offline_access` scope.
 * Their own table now (the previous plugin kept the refresh token as a column on
 * the access token), which is what makes revoking one independently possible.
 *
 * `clientId` carries no foreign key on purpose: registered clients live in
 * configuration, not in `oauthClient`, so a constraint would reject every token
 * this provider issues.
 */
export const oauthRefreshToken = sqliteTable('oauthRefreshToken', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  clientId: text('clientId').notNull(),
  sessionId: text('sessionId').references(() => session.id, {
    onDelete: 'set null',
  }),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  referenceId: text('referenceId'),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  revoked: integer('revoked', { mode: 'timestamp' }),
  authTime: integer('authTime', { mode: 'timestamp' }),
  scopes: text('scopes').notNull(),
});

/**
 * Opaque access tokens. Only written when a token cannot be issued as a signed
 * JWT, so the common consumer-app path never touches this table.
 */
export const oauthAccessToken = sqliteTable('oauthAccessToken', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  clientId: text('clientId').notNull(),
  sessionId: text('sessionId').references(() => session.id, {
    onDelete: 'set null',
  }),
  userId: text('userId').references(() => user.id),
  referenceId: text('referenceId'),
  refreshId: text('refreshId').references(() => oauthRefreshToken.id),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  scopes: text('scopes').notNull(),
});

/**
 * Recorded consent per user/client. Every registered client skips the consent
 * screen — they are all mine — but the provider still reads this table on the
 * way past, so it has to exist.
 */
export const oauthConsent = sqliteTable('oauthConsent', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  userId: text('userId').references(() => user.id),
  referenceId: text('referenceId'),
  scopes: text('scopes').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(
    () => new Date(),
  ),
});

/**
 * Token signing keys. The private half is encrypted with BETTER_AUTH_SECRET,
 * so rotating that secret without clearing this table breaks token signing.
 */
export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('publicKey').notNull(),
  privateKey: text('privateKey').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }),
});

/**
 * Provider configuration that used to live only in wrangler.toml: the GitHub
 * OAuth App credentials and the signup allowlist.
 *
 * Key/value rather than a column per setting, so adding the next one is a row
 * and not a migration. `encrypted` marks values sealed by ../lib/secret-box.ts —
 * only the GitHub client secret today, because it is the one value this service
 * has to hand to someone else in plaintext and therefore cannot hash.
 */
export const providerSetting = sqliteTable('providerSetting', {
  key: text('key').primaryKey(),
  value: text('value'),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text('updatedBy'),
});

/**
 * Who changed which OAuth client, when, and to what.
 *
 * A table rather than log lines: Worker logs are not retained long enough to
 * answer "when did this redirect URI change, and who changed it", which is the
 * question that matters once clients can be edited from a UI instead of by a
 * reviewed commit.
 *
 * `actorEmail` is denormalised on purpose — it records who acted at the time,
 * and must survive that account being renamed or deleted. `clientId` is plain
 * text with no foreign key: the row it names may be gone (that is what a
 * `delete` entry means), and configured clients never had a row at all.
 */
export const oauthClientAudit = sqliteTable('oauthClientAudit', {
  id: text('id').primaryKey(),
  actorUserId: text('actorUserId'),
  actorEmail: text('actorEmail').notNull(),
  /** create | update | delete | rotate-secret, plus settings actions later. */
  action: text('action').notNull(),
  clientId: text('clientId'),
  /** JSON: the changed fields, before and after. Never contains a secret. */
  changes: text('changes'),
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type OAuthClient = typeof oauthClient.$inferSelect;
export type OAuthRefreshToken = typeof oauthRefreshToken.$inferSelect;
export type OAuthAccessToken = typeof oauthAccessToken.$inferSelect;
export type OAuthConsent = typeof oauthConsent.$inferSelect;
export type Jwks = typeof jwks.$inferSelect;
export type OAuthClientAudit = typeof oauthClientAudit.$inferSelect;
export type ProviderSetting = typeof providerSetting.$inferSelect;
