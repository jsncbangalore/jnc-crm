export interface ParsedClientInfo {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  rawUserAgent: string;
}

/**
 * Parses user agent string to extract clean Browser name, OS, and Device type.
 */
export function parseClientUserAgent(ua?: string | null): ParsedClientInfo {
  if (!ua || ua === 'unknown' || ua === 'Unknown' || ua.trim() === '') {
    return {
      browser: 'Web Browser',
      os: 'Desktop / Workstation',
      deviceType: 'desktop',
      rawUserAgent: ua || '',
    };
  }

  let browser = 'Web Browser';
  let os = 'Desktop / Workstation';
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';

  // 1. Detect Device Type
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i.test(ua)) {
    deviceType = 'mobile';
  }

  // 2. Detect Operating System
  if (/Windows NT 10.0|Windows NT 11.0|Win64|WOW64|Windows/i.test(ua)) {
    os = 'Windows 10/11';
  } else if (/Windows NT 6.3/i.test(ua)) {
    os = 'Windows 8.1';
  } else if (/Windows NT 6.2/i.test(ua)) {
    os = 'Windows 8';
  } else if (/Windows NT 6.1/i.test(ua)) {
    os = 'Windows 7';
  } else if (/iPhone OS (\d+([._]\d+)*)/i.test(ua)) {
    const match = ua.match(/iPhone OS (\d+([._]\d+)*)/i);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/iPad.*OS (\d+([._]\d+)*)/i.test(ua)) {
    const match = ua.match(/iPad.*OS (\d+([._]\d+)*)/i);
    os = match ? `iPadOS ${match[1].replace(/_/g, '.')}` : 'iPadOS';
  } else if (/Mac OS X (\d+([._]\d+)*)|Macintosh|Darwin/i.test(ua)) {
    const match = ua.match(/Mac OS X (\d+([._]\d+)*)/i);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/Android (\d+([._]\d+)*)/i.test(ua)) {
    const match = ua.match(/Android (\d+([._]\d+)*)/i);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (/Ubuntu/i.test(ua)) {
    os = 'Ubuntu Linux';
  } else if (/Linux|X11/i.test(ua)) {
    os = 'Linux';
  } else if (/CrOS/i.test(ua)) {
    os = 'Chrome OS';
  } else if (/playwright|headless|puppeteer/i.test(ua)) {
    os = 'Automated Agent';
  } else {
    os = 'Desktop / Workstation';
  }

  // 3. Detect Browser Name & Version
  if (/Edg(?:e|A|iOS)?\/(\d+(\.\d+)?)/i.test(ua)) {
    const match = ua.match(/Edg(?:e|A|iOS)?\/(\d+(\.\d+)?)/i);
    browser = match ? `Microsoft Edge ${match[1]}` : 'Microsoft Edge';
  } else if (/OPR\/(\d+(\.\d+)?)|Opera\/(\d+(\.\d+)?)/i.test(ua)) {
    const match = ua.match(/(?:OPR|Opera)\/(\d+(\.\d+)?)/i);
    browser = match ? `Opera ${match[1]}` : 'Opera';
  } else if (/SamsungBrowser\/(\d+(\.\d+)?)/i.test(ua)) {
    const match = ua.match(/SamsungBrowser\/(\d+(\.\d+)?)/i);
    browser = match ? `Samsung Internet ${match[1]}` : 'Samsung Internet';
  } else if (/Chrome\/(\d+(\.\d+)?)/i.test(ua) && !/Chromium/i.test(ua)) {
    const match = ua.match(/Chrome\/(\d+(\.\d+)?)/i);
    browser = match ? `Google Chrome ${match[1]}` : 'Google Chrome';
  } else if (/Firefox\/(\d+(\.\d+)?)/i.test(ua)) {
    const match = ua.match(/Firefox\/(\d+(\.\d+)?)/i);
    browser = match ? `Mozilla Firefox ${match[1]}` : 'Mozilla Firefox';
  } else if (/Version\/(\d+(\.\d+)?).*Safari/i.test(ua)) {
    const match = ua.match(/Version\/(\d+(\.\d+)?)/i);
    browser = match ? `Safari ${match[1]}` : 'Safari';
  } else if (/Safari/i.test(ua)) {
    browser = 'Safari';
  } else if (/Playwright/i.test(ua)) {
    browser = 'Playwright Automated Browser';
  }

  return {
    browser,
    os,
    deviceType,
    rawUserAgent: ua,
  };
}
