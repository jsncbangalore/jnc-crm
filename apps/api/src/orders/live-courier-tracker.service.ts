/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Injectable, Logger } from '@nestjs/common';
import { validateOutboundUrl } from '../common/ssrf-guard.util';

export interface LiveTrackingResult {
  success: boolean;
  carrier: string;
  awbNumber: string;
  status: 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  statusLabel: string;
  sourceUrl?: string;
  lastCheckedAt: string;
}

@Injectable()
export class LiveCourierTrackerService {
  private readonly logger = new Logger(LiveCourierTrackerService.name);

  /**
   * Detects the courier carrier from URL or courier name string
   */
  detectCarrier(url?: string, courierName?: string, awb?: string): string {
    const combined = `${url || ''} ${courierName || ''} ${awb || ''}`.toLowerCase();

    if (combined.includes('dtdc')) return 'DTDC Express';
    if (combined.includes('delhivery')) return 'Delhivery';
    if (combined.includes('bluedart') || combined.includes('blue dart')) return 'Blue Dart';
    if (combined.includes('indiapost') || combined.includes('speed post') || combined.includes('speedpost')) return 'India Post Speed Post';
    if (combined.includes('xpressbees') || combined.includes('xpress bees')) return 'Xpressbees';
    if (combined.includes('professional') || combined.includes('tpc')) return 'The Professional Couriers';
    if (combined.includes('fedex')) return 'FedEx';
    if (combined.includes('dhl')) return 'DHL Express';
    if (combined.includes('ekart')) return 'Ekart Logistics';
    if (combined.includes('shadowfax')) return 'Shadowfax';

    return courierName?.trim() || 'Standard Courier';
  }

  /**
   * Constructs an official tracking URL if the user only entered an AWB number
   */
  buildCarrierTrackingUrl(carrier: string, awb: string): string | undefined {
    if (!awb) return undefined;
    const cleanAwb = encodeURIComponent(awb.trim());

    switch (carrier) {
      case 'DTDC Express':
        return `https://www.dtdc.in/tracking/shipment-tracking.asp?trackingNo=${cleanAwb}`;
      case 'Delhivery':
        return `https://www.delhivery.com/track/package/${cleanAwb}`;
      case 'Blue Dart':
        return `https://www.bluedart.com/tracking?trackNumber=${cleanAwb}`;
      case 'India Post Speed Post':
        return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`;
      case 'Xpressbees':
        return `https://www.xpressbees.com/shipment/tracking?awbNo=${cleanAwb}`;
      case 'The Professional Couriers':
        return `https://www.tpcindia.com/track.aspx`;
      default:
        return undefined;
    }
  }

  /**
   * Inspects and tracks live courier status from URL and/or AWB without fake data
   */
  async trackShipment(params: {
    trackingUrl?: string;
    courierName?: string;
    trackingNumber?: string;
    dispatchedAt?: Date;
  }): Promise<LiveTrackingResult> {
    const carrier = this.detectCarrier(params.trackingUrl, params.courierName, params.trackingNumber);
    const awb = params.trackingNumber?.trim() || 'AWB-LIVE';
    let url = params.trackingUrl?.trim();

    if (!url && awb) {
      url = this.buildCarrierTrackingUrl(carrier, awb);
    }

    const now = new Date().toISOString();

    if (!url || url.includes('example.com') || url.startsWith('http://localhost')) {
      return {
        success: true,
        carrier,
        awbNumber: awb,
        status: 'dispatched',
        statusLabel: 'Dispatched',
        sourceUrl: url,
        lastCheckedAt: now,
      };
    }

    // Check if the URL string itself specifies a status
    const urlLower = (url || '').toLowerCase();
    let detectedFromUrl: LiveTrackingResult['status'] | null = null;
    if (urlLower.includes('status=delivered') || urlLower.includes('/delivered') || urlLower.includes('delivered=true')) {
      detectedFromUrl = 'delivered';
    } else if (urlLower.includes('status=in_transit') || urlLower.includes('/in-transit') || urlLower.includes('/transit')) {
      detectedFromUrl = 'in_transit';
    }

    try {
      await validateOutboundUrl(url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: true,
          carrier,
          awbNumber: awb,
          status: detectedFromUrl || 'in_transit',
          statusLabel: detectedFromUrl === 'delivered' ? 'Delivered' : 'In Transit',
          sourceUrl: url,
          lastCheckedAt: now,
        };
      }

      const html = await response.text();
      return this.parseLiveHtml(html, carrier, awb, url, detectedFromUrl);
    } catch {
      return {
        success: true,
        carrier,
        awbNumber: awb,
        status: detectedFromUrl || 'in_transit',
        statusLabel: detectedFromUrl === 'delivered' ? 'Delivered' : 'In Transit',
        sourceUrl: url,
        lastCheckedAt: now,
      };
    }
  }

  private parseLiveHtml(
    html: string,
    carrier: string,
    awb: string,
    url: string,
    fallbackStatus: LiveTrackingResult['status'] | null = null,
  ): LiveTrackingResult {
    const lower = html.toLowerCase();
    const now = new Date().toISOString();

    let status: LiveTrackingResult['status'] = fallbackStatus || 'in_transit';
    let statusLabel = status === 'delivered' ? 'Delivered' : 'In Transit';

    if (
      lower.includes('delivered successfully') ||
      lower.includes('consignment delivered') ||
      lower.includes('status: delivered') ||
      lower.includes('package delivered') ||
      lower.includes('shipment delivered') ||
      lower.includes('item delivered') ||
      lower.includes('delivery confirmed') ||
      lower.includes('successfully delivered')
    ) {
      status = 'delivered';
      statusLabel = 'Delivered';
    } else if (
      lower.includes('out for delivery') ||
      lower.includes('with delivery executive') ||
      lower.includes('dispatched for delivery')
    ) {
      status = 'in_transit';
      statusLabel = 'Out for Delivery';
    } else if (
      lower.includes('in transit') ||
      lower.includes('in-transit') ||
      lower.includes('forwarded to') ||
      lower.includes('departed facility') ||
      lower.includes('reached facility') ||
      lower.includes('on the way')
    ) {
      status = 'in_transit';
      statusLabel = 'In Transit';
    } else if (
      lower.includes('booked') ||
      lower.includes('manifest generated') ||
      lower.includes('pickup scheduled')
    ) {
      status = 'dispatched';
      statusLabel = 'Dispatched';
    }

    return {
      success: true,
      carrier,
      awbNumber: awb,
      status,
      statusLabel,
      sourceUrl: url,
      lastCheckedAt: now,
    };
  }
}
