import { createDatabase } from 'db0';
import cloudflareD1 from 'db0/connectors/cloudflare-d1';

/**
 * DevRadar's own database — Cloudflare D1 `dev-radar-db`, bound as `DB` in
 * apps/dev-radar/wrangler.toml.
 *
 * Data ownership (spec 021): DevAuth's database holds identity, DevFlare's
 * holds projects, DevTools' holds connected-tool state, and this one holds
 * DevRadar's session and the mirrored GitHub state — nothing else, and never
 * read or written by another app.
 *
 * The connector resolves the binding lazily from `globalThis.__env__`, which
 * Nitro sets per request in production and from wrangler's getPlatformProxy()
 * in dev. Schema lives in ./migrations and is applied with
 * `wrangler d1 migrations apply`, never at import time.
 */
export const db = createDatabase(
  cloudflareD1({
    bindingName: 'DB',
  }),
);

/** The slice of db0 the server libraries use — lets tests pass a real SQLite. */
export interface SqlDatabase {
  sql<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

/** db0's result for a SELECT. */
export interface Rows<T> {
  rows?: T[];
}
