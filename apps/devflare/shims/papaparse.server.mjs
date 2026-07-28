/**
 * Server-side stub for `papaparse`, aliased in only for the Nitro/Worker build
 * (see `nitro.alias` in ../vite.config.ts).
 *
 * Why: papaparse is CJS-only and builds a Web Worker by stringifying a module
 * factory into a Blob. Rollup's CommonJS transform desyncs on that construct
 * and fails the Worker build with a bogus parse error inside the blob string.
 * esbuild parses the same file fine, so this is a bundler issue, not bad JS.
 *
 * Why a stub is correct rather than a workaround: DataConverter is a
 * browser-only tool (AGENTS.md — "All tool logic runs in the browser"). The
 * server renders the page shell but never calls these functions; they only run
 * from user event handlers on the client, where the real papaparse is loaded.
 *
 * If SSR ever does call one, this throws loudly instead of silently returning
 * wrong data.
 */

const unavailable = (name) => () => {
  throw new Error(
    `[papaparse] '${name}' was called during server-side rendering. ` +
      `papaparse is stubbed in the Worker build because it is browser-only; ` +
      `move this call into a client-side event handler, or drop the alias in ` +
      `apps/devflare/vite.config.ts if the server genuinely needs to parse CSV.`,
  );
};

export const parse = unavailable('parse');
export const unparse = unavailable('unparse');

export const BAD_DELIMITERS = [];
export const RECORD_SEP = String.fromCharCode(30);
export const UNIT_SEP = String.fromCharCode(31);
export const WORKERS_SUPPORTED = false;
export const NODE_STREAM_INPUT = 1;

export default {
  parse,
  unparse,
  BAD_DELIMITERS,
  RECORD_SEP,
  UNIT_SEP,
  WORKERS_SUPPORTED,
  NODE_STREAM_INPUT,
};
