import { resolveAddresses, DnsResolutionError, type Fetcher } from './dns';
import { isPublicAddress } from './ip';
import { checkFetchUrl, TargetError } from './target';

/**
 * Fetches a URL the way a browser would reach it, one hop at a time, without
 * ever becoming a proxy:
 *
 * - every hop (the first one and each redirect target) is re-validated:
 *   http(s) only, hostname only, default port, no credentials;
 * - every hop's hostname is resolved first, and *all* of its A/AAAA answers
 *   must be public addresses — otherwise the hop is refused before any
 *   connection is made;
 * - redirects are followed manually (`redirect: 'manual'`), at most
 *   MAX_REDIRECTS, each with its own timeout, under an overall deadline;
 * - the response body is never read — only status and headers come back,
 *   and header values are capped.
 *
 * DNS rebinding: the runtime resolves the name again when it connects, so a
 * hostile resolver could answer differently the second time. Checking every
 * hop narrows that window; on Cloudflare Workers the connection also leaves
 * from Cloudflare's network, never from a private network of the owner's.
 * It cannot be closed completely without pinning the address, which `fetch`
 * does not allow.
 */

export const MAX_REDIRECTS = 5;
export const HOP_TIMEOUT_MS = 8000;
export const TOTAL_DEADLINE_MS = 20_000;
const MAX_HEADERS = 100;
const MAX_HEADER_VALUE = 4096;

export interface ProbeHop {
  url: string;
  status: number;
  statusText: string;
  location?: string;
  headers: { name: string; value: string }[];
  addresses: string[];
  durationMs: number;
}

export type ProbeFailure =
  | { kind: 'blocked'; url: string; message: string }
  | { kind: 'dns'; url: string; message: string }
  | { kind: 'timeout'; url: string; message: string }
  | { kind: 'network'; url: string; message: string }
  | { kind: 'too-many-redirects'; url: string; message: string };

export interface ProbeResult {
  hops: ProbeHop[];
  finalUrl?: string;
  failure?: ProbeFailure;
}

export interface ProbeDependencies {
  fetch: Fetcher;
  /** DNS for the SSRF check; defaults to DoH through `fetch`. */
  resolve?: (hostname: string) => Promise<string[]>;
  now?: () => number;
}

function collectHeaders(headers: Headers): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  headers.forEach((value, name) => {
    if (out.length < MAX_HEADERS)
      out.push({ name, value: value.slice(0, MAX_HEADER_VALUE) });
  });
  return out;
}

export async function probe(
  start: URL,
  deps: ProbeDependencies,
): Promise<ProbeResult> {
  const now = deps.now ?? (() => Date.now());
  const resolve =
    deps.resolve ?? ((host: string) => resolveAddresses(host, deps.fetch));
  const deadline = now() + TOTAL_DEADLINE_MS;
  const hops: ProbeHop[] = [];
  let url = start;

  for (let redirects = 0; ; redirects++) {
    const href = url.toString();

    try {
      checkFetchUrl(url);
    } catch (error) {
      return {
        hops,
        failure: {
          kind: 'blocked',
          url: href,
          message: (error as TargetError).message,
        },
      };
    }

    let addresses: string[];
    try {
      addresses = await resolve(url.hostname);
    } catch (error) {
      if (error instanceof DnsResolutionError) {
        return {
          hops,
          failure: {
            kind: error.reason === 'timeout' ? 'timeout' : 'dns',
            url: href,
            message: error.message,
          },
        };
      }
      return {
        hops,
        failure: {
          kind: 'dns',
          url: href,
          message: `Could not resolve ${url.hostname}.`,
        },
      };
    }
    const privateAddress = addresses.find(
      (address) => !isPublicAddress(address),
    );
    if (privateAddress !== undefined) {
      return {
        hops,
        failure: {
          kind: 'blocked',
          url: href,
          message: `${url.hostname} resolves to a non-public address (${privateAddress}); not fetched.`,
        },
      };
    }

    const remaining = deadline - now();
    if (remaining <= 0) {
      return {
        hops,
        failure: {
          kind: 'timeout',
          url: href,
          message: 'The inspection took too long.',
        },
      };
    }

    const started = now();
    let response: Response;
    try {
      response = await deps.fetch(href, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': 'DevTools-DomainInspector/1.0',
          accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(Math.min(HOP_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        hops,
        failure: timedOut
          ? {
              kind: 'timeout',
              url: href,
              message: `No response from ${url.host} within ${HOP_TIMEOUT_MS / 1000} s.`,
            }
          : {
              kind: 'network',
              url: href,
              message: `Could not connect to ${url.host}.`,
            },
      };
    }
    const durationMs = Math.max(0, now() - started);
    // Never read the body: this is not a proxy.
    await response.body?.cancel().catch(() => undefined);

    const location = response.headers.get('location') ?? undefined;
    hops.push({
      url: href,
      status: response.status,
      statusText: response.statusText,
      location,
      headers: collectHeaders(response.headers),
      addresses,
      durationMs,
    });

    const isRedirect =
      [301, 302, 303, 307, 308].includes(response.status) && location;
    if (!isRedirect) return { hops, finalUrl: href };

    if (redirects >= MAX_REDIRECTS) {
      return {
        hops,
        failure: {
          kind: 'too-many-redirects',
          url: href,
          message: `Stopped after ${MAX_REDIRECTS} redirects.`,
        },
      };
    }

    try {
      url = new URL(location, url);
      url.hash = '';
    } catch {
      return {
        hops,
        failure: {
          kind: 'blocked',
          url: href,
          message: 'The redirect target is not a valid URL.',
        },
      };
    }
  }
}
