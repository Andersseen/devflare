import { createDatabase } from 'db0';
import cloudflareD1 from 'db0/connectors/cloudflare-d1';

/**
 * DevTools' own database — Cloudflare D1 `devtools-db`, bound as `DB` in
 * apps/devtools/wrangler.toml.
 *
 * Data ownership (spec 020): DevAuth's database holds identity, DevFlare's
 * holds projects and infrastructure metadata, and this one holds connected
 * DevTools state only — DevTools' session and short links.
 *
 * Same wiring as DevFlare's: the connector resolves the binding lazily from
 * `globalThis.__env__`, which Nitro sets per request in production and from
 * wrangler's getPlatformProxy() in dev. Schema lives in ./migrations and is
 * applied with `wrangler d1 migrations apply`, never at import time.
 */
export const db = createDatabase(
  cloudflareD1({
    bindingName: 'DB',
  }),
);

/** The slice of db0 the server libraries use — lets tests pass a fake. */
export interface SqlDatabase {
  sql<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}
