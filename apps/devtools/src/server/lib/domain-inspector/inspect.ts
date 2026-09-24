import {
  analyzeHeaders,
  type HeaderAnalysis,
} from '../../../app/tools/security-headers.analyzer';
import { queryDns, RECORD_TYPES, type DnsAnswer, type Fetcher } from './dns';
import { probe, type ProbeResult } from './probe';
import { parseTarget } from './target';

/**
 * Domain Inspector: DNS + the HTTP redirect chain + the shared header
 * analysis of the final response. Nothing is stored — no history, no cache.
 *
 * What it does not report: TLS certificate details. Workers `fetch` does not
 * expose the peer certificate, so there is nothing reliable to show.
 */

export interface CdnHint {
  provider: string;
  evidence: string;
}

export interface InspectionReport {
  target: { input: string; hostname: string; url: string };
  dns: DnsAnswer[];
  http: ProbeResult;
  headers?: HeaderAnalysis;
  hints: CdnHint[];
  inspectedAt: string;
}

const HINTS: { header: string; provider: string; match?: RegExp }[] = [
  { header: 'cf-ray', provider: 'Cloudflare' },
  { header: 'server', provider: 'Cloudflare', match: /^cloudflare$/i },
  { header: 'x-vercel-id', provider: 'Vercel' },
  { header: 'x-nf-request-id', provider: 'Netlify' },
  { header: 'x-amz-cf-id', provider: 'Amazon CloudFront' },
  { header: 'x-served-by', provider: 'Fastly', match: /cache-/i },
  { header: 'x-github-request-id', provider: 'GitHub Pages' },
  { header: 'fly-request-id', provider: 'Fly.io' },
  { header: 'x-azure-ref', provider: 'Azure Front Door' },
  {
    header: 'server',
    provider: 'Google',
    match: /^(gws|gse|ESF|Google Frontend)$/i,
  },
  { header: 'x-goog-generation', provider: 'Google Cloud Storage' },
  { header: 'server', provider: 'Akamai', match: /AkamaiGHost/i },
];

export function cdnHints(
  headers: { name: string; value: string }[],
): CdnHint[] {
  const found = new Map<string, CdnHint>();
  for (const hint of HINTS) {
    const header = headers.find((h) => h.name.toLowerCase() === hint.header);
    if (!header || (hint.match && !hint.match.test(header.value))) continue;
    if (!found.has(hint.provider)) {
      found.set(hint.provider, {
        provider: hint.provider,
        evidence: `${hint.header}: ${header.value.slice(0, 80)}`,
      });
    }
  }
  return [...found.values()];
}

export async function inspectDomain(
  input: unknown,
  deps: { fetch: Fetcher; now?: () => number },
): Promise<InspectionReport> {
  const url = parseTarget(input);

  const [dns, http] = await Promise.all([
    Promise.all(
      RECORD_TYPES.map((type) => queryDns(url.hostname, type, deps.fetch)),
    ),
    probe(url, deps),
  ]);

  const last = http.hops[http.hops.length - 1];
  const finalHop = http.finalUrl ? last : undefined;

  return {
    target: {
      input: String(input).trim(),
      hostname: url.hostname,
      url: url.toString(),
    },
    dns,
    http,
    headers: finalHop
      ? analyzeHeaders(finalHop.headers, {
          https: finalHop.url.startsWith('https:'),
        })
      : undefined,
    hints: finalHop ? cdnHints(finalHop.headers) : [],
    inspectedAt: new Date(deps.now?.() ?? Date.now()).toISOString(),
  };
}
