import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard.
 *
 * Two layers:
 *  1. Static checks on the parsed URL (scheme, credentials, obvious
 *     loopback/private hostnames) — cheap, catches the common cases.
 *  2. DNS resolution + IP-range checks against every A/AAAA record the
 *     hostname resolves to — catches "evil.com -> 127.0.0.1" style DNS
 *     tricks.
 *
 * Residual risk (documented, not solved here): DNS rebinding, where the
 * hostname resolves to a public IP at validation time but to a private IP
 * by the time Playwright actually connects (TOCTOU). Fully closing that
 * gap requires pinning the resolved IP at the TCP layer (e.g. routing
 * Playwright traffic through a locked-down forward proxy, or overriding
 * Node's DNS resolution at the OS/container level) which is out of scope
 * for an in-process check. If this matters for your threat model, put the
 * capture service behind an egress proxy/allowlist at the network layer
 * in addition to this check.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // GCP metadata
]);

// Cloud metadata IPs (AWS/GCP/Azure/DigitalOcean all use 169.254.169.254)
const BLOCKED_EXACT_IPS = new Set(["169.254.169.254", "fd00:ec2::254"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast (224+) / reserved (240+)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — recurse on the embedded v4 address
    const v4 = normalized.split(":").pop()!;
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIP(ip: string): boolean {
  if (BLOCKED_EXACT_IPS.has(ip)) return true;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unrecognized format -> fail closed
}

export class SsrfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfValidationError";
  }
}

/**
 * Validates a target URL is safe to navigate to. Throws SsrfValidationError
 * if not. Returns the parsed URL on success.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfValidationError("URL is not well-formed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfValidationError(
      `Protocol '${url.protocol}' is not allowed; only http/https`,
    );
  }

  // Credentials embedded in the URL (http://user:pass@host) are a common
  // way to smuggle auth into internal services — reject outright.
  if (url.username || url.password) {
    throw new SsrfValidationError("URLs with embedded credentials are not allowed");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfValidationError(`Host '${hostname}' is blocked`);
  }

  // If the hostname is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new SsrfValidationError(`IP '${hostname}' is in a private/reserved range`);
    }
    return url;
  }

  // Otherwise resolve DNS and check every returned address.
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
      throw new SsrfValidationError(
        `Host '${hostname}' resolves to a private/reserved IP (${addr})`,
      );
    }
  }

  return url;
}
