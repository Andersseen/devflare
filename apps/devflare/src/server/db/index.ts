import { createDatabase } from 'db0';
import cloudflareD1 from 'db0/connectors/cloudflare-d1';

/**
 * App database — Cloudflare D1, bound as `DB` in apps/devflare/wrangler.toml.
 *
 * The connector resolves the binding lazily from `globalThis.__env__` on every
 * query, so this module-level instance is safe: Nitro's Cloudflare runtime sets
 * `__env__` per request in production, and its dev plugin sets the same global
 * from wrangler's `getPlatformProxy()` (local miniflare, state persisted under
 * .wrangler/state/v3). One code path for both.
 *
 * Schema lives in ./migrations and is applied with
 * `wrangler d1 migrations apply` — not with DDL at import time, which used to
 * run on every request/cold start and could not be rolled back.
 */
export const db = createDatabase(
  cloudflareD1({
    bindingName: 'DB',
  }),
);
