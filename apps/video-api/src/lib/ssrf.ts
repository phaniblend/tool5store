import dns from "node:dns/promises";
import net from "node:net";

/**
 * Same SSRF guard as apps/capture-api/src/lib/ssrf.ts, applied here to
 * remote media URLs before we ever fetch them. Duplicated rather than
 * shared across a workspace package for now — small enough that keeping
 * the two apps independently deployable/vendorable outweighs the DRY
 * violation. If it drifts, extract to packages/shared.
 *
 * Residual risk: DNS rebinding (TOCTOU between this check and the actual
 * fetch). See the sibling file in capture-api for the full writeup.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

const BLOCKED_EXACT_IPS = new Set(["169.254.169.254", "fd00:ec2::254"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1" || n === "::") return true;
  if (n.startsWith("fe80:")) return true;
  if (n.startsWith("fc") || n.startsWith("fd")) return true;
  if (n.startsWith("::ffff:")) {
    const v4 = n.split(":").pop()!;
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIP(ip: string): boolean {
  if (BLOCKED_EXACT_IPS.has(ip)) return true;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export class SsrfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfValidationError";
  }
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfValidationError("URL is not well-formed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfValidationError(`Protocol '${url.protocol}' is not allowed; only http/https`);
  }
  if (url.username || url.password) {
    throw new SsrfValidationError("URLs with embedded credentials are not allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfValidationError(`Host '${hostname}' is blocked`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new SsrfValidationError(`IP '${hostname}' is in a private/reserved range`);
    }
    return url;
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new SsrfValidationError(`Could not resolve host '${hostname}'`);
  }

  if (addresses.length === 0) {
    throw new SsrfValidationError(`Host '${hostname}' did not resolve to any address`);
  }

  for (const addr of addresses) {
    if (isPrivateIP(addr)) {
      throw new SsrfValidationError(`Host '${hostname}' resolves to a private/reserved IP (${addr})`);
    }
  }

  return url;
}
