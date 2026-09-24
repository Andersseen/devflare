/**
 * DNS over HTTPS against Cloudflare's resolver, JSON API
 * (https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/).
 * The endpoint is fixed — user input only ever becomes the `name` parameter.
 */

export const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

const TYPE_NUMBERS: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
};

export interface DnsRecord {
  name: string;
  type: string;
  ttl: number;
  data: string;
}

export type DnsStatus =
  | 'ok'
  | 'nxdomain'
  | 'servfail'
  | 'refused'
  | 'timeout'
  | 'error';

export interface DnsAnswer {
  type: RecordType;
  status: DnsStatus;
  records: DnsRecord[];
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface DohJson {
  Status: number;
  Answer?: { name: string; type: number; TTL: number; data: string }[];
}

const RCODES: Record<number, DnsStatus> = {
  0: 'ok',
  2: 'servfail',
  3: 'nxdomain',
  5: 'refused',
};

export async function queryDns(
  name: string,
  type: RecordType,
  fetcher: Fetcher,
  timeoutMs = 5000,
): Promise<DnsAnswer> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { type, status: timedOut ? 'timeout' : 'error', records: [] };
  }
  if (!response.ok) return { type, status: 'error', records: [] };

  let body: DohJson;
  try {
    body = (await response.json()) as DohJson;
  } catch {
    return { type, status: 'error', records: [] };
  }

  const status = RCODES[body.Status] ?? 'error';
  const records = (body.Answer ?? []).slice(0, 50).map((answer) => ({
    name: answer.name.replace(/\.$/, ''),
    type: TYPE_NUMBERS[answer.type] ?? String(answer.type),
    ttl: answer.TTL,
    data: answer.data.slice(0, 1024),
  }));
  return { type, status, records };
}

/** Every A/AAAA address the name resolves to, following CNAMEs (the
 * resolver answers with the whole chain). Throws when there are none. */
export async function resolveAddresses(
  name: string,
  fetcher: Fetcher,
  timeoutMs = 5000,
): Promise<string[]> {
  const [a, aaaa] = await Promise.all([
    queryDns(name, 'A', fetcher, timeoutMs),
    queryDns(name, 'AAAA', fetcher, timeoutMs),
  ]);
  if (a.status === 'nxdomain' && aaaa.status === 'nxdomain') {
    throw new DnsResolutionError(
      'nxdomain',
      `${name} does not exist (NXDOMAIN).`,
    );
  }
  if (a.status === 'timeout' && aaaa.status === 'timeout') {
    throw new DnsResolutionError(
      'timeout',
      `DNS lookup for ${name} timed out.`,
    );
  }
  const addresses = [...a.records, ...aaaa.records]
    .filter((record) => record.type === 'A' || record.type === 'AAAA')
    .map((record) => record.data);
  if (addresses.length === 0) {
    throw new DnsResolutionError(
      'no-address',
      `${name} has no A or AAAA records.`,
    );
  }
  return addresses;
}

export class DnsResolutionError extends Error {
  constructor(
    readonly reason: 'nxdomain' | 'timeout' | 'no-address',
    message: string,
  ) {
    super(message);
  }
}
