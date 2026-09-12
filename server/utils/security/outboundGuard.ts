/**
 * FIX-U — one gate for every connection this server opens on someone else's
 * behalf (BUG-071, BUG-077, BUG-099).
 *
 * Three routes let an authenticated user name the destination: the CJIB FTPS
 * connection test, the SMTP connection test, and (indirectly) the outgoing
 * geocoding/routing calls. Without a guard those are a port scanner and an
 * SSRF primitive aimed at whatever the container can reach — the database, the
 * Docker gateway, a cloud metadata endpoint on 169.254.169.254.
 *
 * The rules here are deliberately blunt:
 *   - a destination is resolved through DNS and *every* returned address must
 *     be a public unicast address (DNS rebinding cannot get a private address
 *     past this because the check is on the resolved set, not on the name);
 *   - the caller gets one generic message whatever went wrong, so the route
 *     stops being an oracle that distinguishes "refused", "timed out" and
 *     "open";
 *   - an explicit, non-production opt-out (`OUTBOUND_ALLOW_PRIVATE=true`)
 *     exists for local development and for the tests that point at a stub on
 *     127.0.0.1. It is ignored when NODE_ENV is `production`.
 */
import net from "net";
import { promises as dnsPromises } from "dns";

/** The single message every blocked outbound attempt returns. No details. */
export const OUTBOUND_BLOCKED_MESSAGE =
  "The connection test could not be completed. Check the host name and port, or contact your administrator.";

export class OutboundBlockedError extends Error {
  constructor(message = OUTBOUND_BLOCKED_MESSAGE) {
    super(message);
    this.name = "OutboundBlockedError";
  }
}

/**
 * Local development and the test suite need to reach a stub on 127.0.0.1.
 * Production never does: the flag is ignored there, on purpose, so a stray
 * environment variable cannot re-open the hole on the deployed server.
 */
export function allowsPrivateOutbound(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.OUTBOUND_ALLOW_PRIVATE === "true" || process.env.OUTBOUND_ALLOW_PRIVATE === "1";
}

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** RFC 1918 + every other range that is not public unicast IPv4. */
function isPrivateIpv4(ip: string): boolean {
  const o = ipv4Octets(ip);
  if (!o) return true; // unparseable: refuse rather than guess
  const [a, b] = o;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT, RFC 6598
  if (a === 192 && b === 0 && o[2] === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && o[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && o[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && o[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function expandIpv6(ip: string): number[] | null {
  const zone = ip.indexOf("%");
  const bare = zone === -1 ? ip : ip.slice(0, zone);
  const halves = bare.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (text: string): number[] | null => {
    if (!text) return [];
    const out: number[] = [];
    for (const group of text.split(":")) {
      if (group.includes(".")) {
        const o = ipv4Octets(group);
        if (!o) return null;
        out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    return [...head, ...new Array(fill).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}

function ipv4FromGroups(g: number[], at: number): string {
  return `${g[at] >> 8}.${g[at] & 0xff}.${g[at + 1] >> 8}.${g[at + 1] & 0xff}`;
}

/** Loopback, unique-local, link-local, multicast, and every v4-in-v6 mapping. */
function isPrivateIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // ::ffff:a.b.c.d (v4-mapped) and ::a.b.c.d (v4-compatible)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isPrivateIpv4(ipv4FromGroups(g, 6));
  }
  if (first === 0x64 && g[1] === 0xff9b) return isPrivateIpv4(ipv4FromGroups(g, 6)); // NAT64
  if (first === 0x2002) return isPrivateIpv4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`); // 6to4
  return false;
}

/** True when `ip` is anything other than a public unicast address. */
export function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().replace(/^\[|\]$/g, "");
  const family = net.isIP(trimmed);
  if (family === 4) return isPrivateIpv4(trimmed);
  if (family === 6) return isPrivateIpv6(trimmed);
  return true; // not an IP literal at all
}

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".localdomain"];

/** Names that never need a DNS round trip to be refused. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host === "local" || host === "ip6-localhost") return true;
  return LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Resolves `hostname` and throws `OutboundBlockedError` unless every address it
 * answers with is public. Returns the resolved addresses so a caller can pin
 * the connection to one of them if it wants to.
 */
export async function assertPublicHost(hostname: string): Promise<string[]> {
  const host = String(hostname ?? "").trim().replace(/^\[|\]$/g, "");
  if (!host) throw new OutboundBlockedError();
  if (allowsPrivateOutbound()) return [];

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new OutboundBlockedError();
    return [host];
  }
  if (isLocalHostname(host)) throw new OutboundBlockedError();

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dnsPromises.lookup(host, { all: true, verbatim: true });
  } catch {
    // A name that does not resolve is refused with the same message as a name
    // that resolves to 10.0.0.1: the caller learns nothing either way.
    throw new OutboundBlockedError();
  }
  if (!addresses.length) throw new OutboundBlockedError();
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new OutboundBlockedError();
  }
  return addresses.map((a) => a.address);
}

/**
 * `fetch` with a hard deadline (BUG-099). Without one, an outgoing call to a
 * third party that accepts the TCP connection and then says nothing holds a
 * request handler — and in the routing case a whole transport-planning save —
 * open until the socket eventually dies.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
