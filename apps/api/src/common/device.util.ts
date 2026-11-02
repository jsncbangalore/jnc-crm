/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export function parseDeviceLabel(userAgent?: string): string {
  if (!userAgent || typeof userAgent !== 'string' || userAgent === 'unknown' || userAgent.trim() === '') {
    return 'Web Browser on Desktop / Workstation';
  }
  const ua = userAgent.toLowerCase();

  let os = 'Desktop Workstation';
  if (ua.includes('windows nt 10.0') || ua.includes('windows nt 11.0') || ua.includes('windows') || ua.includes('win64')) {
    os = 'Windows';
  } else if (ua.includes('iphone')) {
    os = 'iPhone';
  } else if (ua.includes('ipad')) {
    os = 'iPad';
  } else if (ua.includes('macintosh') || ua.includes('mac os x') || ua.includes('darwin')) {
    os = 'macOS';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('linux') || ua.includes('x11')) {
    os = 'Linux';
  }

  let browser = 'Browser';
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
    browser = 'Chrome';
  } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('opera/') || ua.includes('opr/')) {
    browser = 'Opera';
  } else if (ua.includes('playwright') || ua.includes('headless')) {
    browser = 'Automated Agent';
  }

  return `${browser} on ${os}`;
}
