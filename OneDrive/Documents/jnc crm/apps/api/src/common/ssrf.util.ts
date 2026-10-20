/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as net from 'net';

/**
 * Validates whether an IP address belongs to loopback, private, link-local,
 * cloud metadata (e.g. AWS/GCP 169.254.169.254), or reserved ranges.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  if (!ip) return true;

  // IPv4 check
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [b0, b1, b2, b3] = parts;

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

    // 169.254.0.0/16 (Link-local & AWS/GCP Cloud Metadata 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (b0 === 192 && b1 === 0 && b2 === 0) return true;

    // 198.18.0.0/15 (Benchmark testing)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

    // 224.0.0.0/4 (Multicast)
    if (b0 >= 224 && b0 <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use)
    if (b0 >= 240) return true;

    // 255.255.255.255 (Broadcast)
    if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) return true;

    return false;
  }

  // IPv6 check
  if (net.isIPv6(ip)) {
    const cleanIp = ip.toLowerCase();

    // ::1 (Loopback)
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') return true;

    // :: (Unspecified)
    if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') return true;

    // fe80::/10 (Link-local)
    if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) return true;

    // fc00::/7 (Unique local address fc00:: or fd00::)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;

    // ::ffff:0:0/96 (IPv4-mapped IPv6)
    if (cleanIp.includes('::ffff:')) {
      const v4Part = cleanIp.split('::ffff:')[1];
      if (v4Part && net.isIPv4(v4Part)) {
        return isPrivateOrBlockedIp(v4Part);
      }
    }

    return false;
  }

  return true;
}

/**
 * Checks if a hostname directly matches localhost or common internal names
 */
export function isInternalHostname(hostname: string): boolean {
  if (!hostname) return true;
  const h = hostname.trim().toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.localhost')) return true;
  if (h.includes('169.254.169.254') || h.includes('metadata.google.internal')) return true;
  return false;
}
