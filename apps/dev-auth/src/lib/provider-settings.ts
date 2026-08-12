/**
 * Provider configuration, resolved from the database first and the environment
 * second.
 *
 * Order is always: D1 row -> config var -> built-in default. With no rows the
 * service behaves exactly as it did before spec 003, so migrating each value is
 * a separate decision and an empty table is never a behaviour change.
 *
 * One value does not follow the usual shape, and it is the reason this module
 * exists rather than being three lines in auth.config.ts. `SIGNUP_ALLOWLIST`
 * empty means *no restriction* — correct as a local-dev default, catastrophic as
 * the failure mode of a database read. So:
 *
 *   a row holding an empty list   -> nobody may sign up   (an explicit decision)
 *   no row at all                 -> fall back to the var (today's behaviour)
 *   a failed read                 -> nobody may sign up   (fail closed)
 *
 * The difference between "configured as empty" and "not configured" is load
 * bearing here, which is why the row's presence is checked, not its emptiness.
 */

import { createDb } from '../db';
import { providerSetting } from '../db/schema';
import type { Env } from '../index';
import { open, SecretBoxError } from './secret-box';

export const SETTING_KEYS = {
  githubClientId: 'github.clientId',
  githubClientSecret: 'github.clientSecret',
  githubEnabled: 'github.enabled',
  signupAllowlist: 'signup.allowlist',
} as const;

export interface GithubSettings {
  clientId: string;
  clientSecret: string;
  /** True only when both halves resolved *and* it has not been switched off. */
  enabled: boolean;
}

export interface ProviderSettings {
  github: GithubSettings;
  signupAllowlist: string[];
  /** True when the allowlist is a real restriction rather than "unset". */
  signupRestricted: boolean;
}

type Rows = Map<string, { value: string | null; encrypted: boolean }>;

/**
 * Per-isolate memo, same reasoning as the client registry: `createAuth` runs per
 * request and this would otherwise be a database read on every one. Short-lived
 * by construction — a new isolate re-reads — and dropped explicitly by the admin
 * API after a write so a change is visible immediately rather than after a cold
 * start.
 */
let cache:
  | { key: string; settings: Promise<ProviderSettings>; at: number }
  | undefined;
const CACHE_MS = 30_000;

/**
 * Keyed on the fallbacks as well as time. Without this a change to the
 * environment would be masked by a memo derived from the previous one — the
 * same reasoning as the client registry's cache key in ../auth.config.ts.
 */
function cacheKey(env: Env): string {
  return JSON.stringify([
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.SIGNUP_ALLOWLIST,
    env.SECRET_ENCRYPTION_KEY,
  ]);
}

export function resetProviderSettingsCache(): void {
  cache = undefined;
}

async function loadRows(env: Env): Promise<Rows | null> {
  try {
    const db = createDb(env.DB);
    const rows = await db.select().from(providerSetting);
    return new Map(
      rows.map((row) => [
        row.key,
        { value: row.value, encrypted: Boolean(row.encrypted) },
      ]),
    );
  } catch (error) {
    // Null means "could not read", which is different from "read, found
    // nothing" — the allowlist treats them differently on purpose.
    console.error('[provider-settings] failed to read settings', error);
    return null;
  }
}

async function resolveSecret(
  entry: { value: string | null; encrypted: boolean } | undefined,
  env: Env,
): Promise<string | undefined> {
  if (!entry?.value) return undefined;
  if (!entry.encrypted) return entry.value;

  try {
    return await open(entry.value, env.SECRET_ENCRYPTION_KEY ?? '');
  } catch (error) {
    // A stored secret we cannot decrypt must not silently fall back to the
    // config var: that would make a key rotation look like it worked.
    console.error(
      '[provider-settings] stored secret could not be decrypted',
      error instanceof SecretBoxError ? error.message : error,
    );
    return undefined;
  }
}

export function parseAllowlist(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

async function resolve(env: Env): Promise<ProviderSettings> {
  const rows = await loadRows(env);

  const githubClientId =
    rows?.get(SETTING_KEYS.githubClientId)?.value || env.GITHUB_CLIENT_ID || '';

  // A stored secret is authoritative even when it cannot be decrypted. Falling
  // back to the config var here would make a botched key rotation look like it
  // worked, and leave the provider quietly using a credential the operator
  // believes they replaced.
  const storedSecret = rows?.get(SETTING_KEYS.githubClientSecret);
  const githubClientSecret = storedSecret?.value
    ? ((await resolveSecret(storedSecret, env)) ?? '')
    : env.GITHUB_CLIENT_SECRET || '';

  const enabledRow = rows?.get(SETTING_KEYS.githubEnabled)?.value;
  // A half-configured provider is never advertised: better-auth would otherwise
  // render a GitHub button that fails at the redirect.
  const enabled =
    Boolean(githubClientId) &&
    Boolean(githubClientSecret) &&
    enabledRow !== 'false';

  const allowlistRow = rows?.get(SETTING_KEYS.signupAllowlist);
  let signupAllowlist: string[];
  let signupRestricted: boolean;

  if (rows === null) {
    // Failed read. Deny rather than open sign-up to the internet.
    signupAllowlist = [];
    signupRestricted = true;
  } else if (allowlistRow) {
    signupAllowlist = parseAllowlist(allowlistRow.value);
    signupRestricted = true;
  } else {
    signupAllowlist = parseAllowlist(env.SIGNUP_ALLOWLIST);
    signupRestricted = signupAllowlist.length > 0;
  }

  return {
    github: {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      enabled,
    },
    signupAllowlist,
    signupRestricted,
  };
}

export function getProviderSettings(env: Env): Promise<ProviderSettings> {
  const key = cacheKey(env);
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) {
    return cache.settings;
  }

  const settings = resolve(env);
  cache = { key, settings, at: Date.now() };
  return settings;
}

/** Whether `email` may create an account, given the resolved settings. */
export function maySignUp(email: string, settings: ProviderSettings): boolean {
  if (!settings.signupRestricted) return true;
  return settings.signupAllowlist.includes(email.trim().toLowerCase());
}
