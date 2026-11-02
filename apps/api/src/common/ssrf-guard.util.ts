/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

/**
 * Checks if an IPv4 address belongs to a private, loopback, or link-local (cloud metadata) range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed treated as dangerous
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-Local / AWS/GCP/Azure Cloud Instance Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 100.64.0.0/10 (Shared address space / CGNAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation/TEST-NET)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to a loopback, unique-local, or link-local range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
    return true;
  }

  // Unique local fc00::/7 (fc00:: - fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-local fe80::/10 (fe80:: - febf::)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  return false;
}

/**
 * Resolves a hostname and validates that ALL resolved IP addresses are public.
 * - Allows https: strictly in production.
 * - Rejects private, loopback, link-local, and cloud metadata IP ranges:
 *   127.0.0.0/8, 0.0.0.0/8
 *   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   169.254.0.0/16 (AWS/Cloud metadata 169.254.169.254)
 *   ::1/128, fc00::/7, fe80::/10
 * Throws ForbiddenException if any resolved IP address belongs to internal/private ranges.
 */
export async function validateOutboundUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new BadRequestException('Invalid URL format.');
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && parsed.protocol !== 'https:') {
    throw new ForbiddenException(`Protocol '${parsed.protocol}' is forbidden in production. Only HTTPS is allowed for outbound requests.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ForbiddenException(`Protocol '${parsed.protocol}' is not allowed for outbound requests. Only HTTP(S) is permitted.`);
  }

  const hostname = parsed.hostname;

  // Disallow localhost by name
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new ForbiddenException(`Requests to '${hostname}' are forbidden (SSRF protection).`);
  }

  // Direct IP checks
  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new ForbiddenException(`Requests to private IP '${hostname}' are forbidden (SSRF protection).`);
    }
    return parsed;
  }

  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  if (net.isIPv6(cleanHost)) {
    if (isPrivateIPv6(cleanHost)) {
      throw new ForbiddenException(`Requests to private IPv6 '${hostname}' are forbidden (SSRF protection).`);
    }
    return parsed;
  }

  // DNS resolution check
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (addr.family === 4 && isPrivateIPv4(addr.address)) {
        throw new ForbiddenException(`Target host '${hostname}' resolved to private IP '${addr.address}' (SSRF protection).`);
      }
      if (addr.family === 6 && isPrivateIPv6(addr.address)) {
        throw new ForbiddenException(`Target host '${hostname}' resolved to private IPv6 '${addr.address}' (SSRF protection).`);
      }
    }
  } catch (err: any) {
    if (err instanceof ForbiddenException) throw err;
    throw new BadRequestException(`Failed to resolve host '${hostname}': ${err.message}`);
  }

  return parsed;
}

export const validateSafeOutboundUrl = validateOutboundUrl;
