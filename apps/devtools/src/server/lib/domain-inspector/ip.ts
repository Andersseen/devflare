/**
 * Is an address on the public Internet? The Domain Inspector only ever
 * connects to hosts whose every DNS answer passes this — the core of its SSRF
 * defence. Ranges are the IANA special-purpose registries (RFC 6890 and
 * updates); anything not clearly global unicast is treated as private.
 */

type Range4 = [number, number]; // [network as uint32, prefix length]

function v4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function cidr4(text: string): Range4 {
  const [net, len] = text.split('/');
  return [v4ToInt(net) as number, Number(len)];
}

const PRIVATE_V4: Range4[] = [
  '0.0.0.0/8', // "this network"
  '10.0.0.0/8', // RFC 1918
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local, incl. cloud metadata 169.254.169.254
  '172.16.0.0/12', // RFC 1918
  '192.0.0.0/24', // IETF protocol assignments
  '192.0.2.0/24', // TEST-NET-1
  '192.31.196.0/24', // AS112
  '192.52.193.0/24', // AMT
  '192.88.99.0/24', // 6to4 relay anycast
  '192.168.0.0/16', // RFC 1918
  '192.175.48.0/24', // AS112
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved, incl. broadcast
].map(cidr4);

function inRange4(value: number, [network, prefix]: Range4): boolean {
  if (prefix === 0) return true;
  const size = 2 ** (32 - prefix);
  return value >= network && value < network + size;
}

export function isPublicIPv4(address: string): boolean {
  const value = v4ToInt(address);
  if (value === null) return false;
  return !PRIVATE_V4.some((range) => inRange4(value, range));
}

/** Expands an IPv6 address into eight 16-bit groups, or null. */
export function parseIPv6(address: string): number[] | null {
  let text = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (text.includes('%')) return null; // zone ids are link-local by nature

  // Embedded IPv4 tail (::ffff:1.2.3.4).
  const v4Match = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (v4Match) {
    const v4 = v4ToInt(v4Match[1]);
    if (v4 === null) return null;
    text = `${text.slice(0, -v4Match[1].length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill('0'),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  const numbers: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    numbers.push(parseInt(group, 16));
  }
  return numbers;
}

function embeddedV4(groups: number[], from: number): string {
  const a = groups[from];
  const b = groups[from + 1];
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

export function isPublicIPv6(address: string): boolean {
  const g = parseIPv6(address);
  if (!g) return false;

  // IPv4-mapped ::ffff:0:0/96 and IPv4-translated 64:ff9b::/96 carry an IPv4
  // address that decides it.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff)
    return isPublicIPv4(embeddedV4(g, 6));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPublicIPv4(embeddedV4(g, 6));
  }
  // 6to4 2002::/16 embeds the IPv4 address in bits 16–47.
  if (g[0] === 0x2002) return isPublicIPv4(embeddedV4(g, 1));

  // Only global unicast 2000::/3 is public at all.
  if ((g[0] & 0xe000) !== 0x2000) return false;

  if (g[0] === 0x2001) {
    if (g[1] < 0x0200) return false; // 2001::/23 IETF protocol assignments (Teredo, ORCHID, …)
    if (g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  }
  if (g[0] === 0x3fff && g[1] < 0x1000) return false; // 3fff::/20 documentation (RFC 9637)
  return true;
}

export function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  return v4ToInt(bare) !== null || bare.includes(':');
}

export function isPublicAddress(address: string): boolean {
  return address.includes(':') ? isPublicIPv6(address) : isPublicIPv4(address);
}
