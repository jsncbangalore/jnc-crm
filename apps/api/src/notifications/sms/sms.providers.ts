/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Logger } from '@nestjs/common';
import { SmsProvider, SmsDispatchResult } from './sms.interface';

/**
 * Development & Test Only Console SMS Provider.
 * Strictly forbidden in production mode.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production' && process.env.SMS_PROVIDER === 'console';
  }

  async sendSms(phone: string, message: string, dltTemplateId?: string): Promise<SmsDispatchResult> {
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        status: 'failed',
        provider: this.name,
        error: 'Console SMS provider is prohibited in production mode.',
      };
    }

    this.logger.log(`[DEV ONLY CONSOLE SMS PROVIDER] To: ${phone} | DLT_Template: ${dltTemplateId || 'none'} | Message: ${message}`);
    return {
      success: true,
      status: 'sent',
      provider: this.name,
      messageId: `console-sms-${Date.now()}`,
    };
  }
}

/**
 * Production Indian DLT Compliant SMS Provider.
 * Dispatches to any registered Indian SMS Gateway (e.g. MSG91, Textlocal, Fast2SMS)
 * with mandatory DLT Principal Entity ID, Sender Header, and Approved Template ID.
 */
export class IndianDltSmsProvider implements SmsProvider {
  readonly name = 'indian_dlt';
  private readonly logger = new Logger(IndianDltSmsProvider.name);

  isConfigured(): boolean {
    const gatewayUrl = process.env.SMS_GATEWAY_URL;
    const apiKey = process.env.SMS_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    const dltEntityId = process.env.SMS_DLT_ENTITY_ID;
    return Boolean(gatewayUrl && apiKey && senderId && dltEntityId);
  }

  async sendSms(phone: string, message: string, dltTemplateId?: string): Promise<SmsDispatchResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'not_configured',
        provider: this.name,
        error: 'Indian DLT SMS configuration is incomplete (SMS_GATEWAY_URL, SMS_API_KEY, SMS_SENDER_ID, SMS_DLT_ENTITY_ID required).',
      };
    }

    const gatewayUrl = process.env.SMS_GATEWAY_URL!;
    const apiKey = process.env.SMS_API_KEY!;
    const senderId = process.env.SMS_SENDER_ID!;
    const dltEntityId = process.env.SMS_DLT_ENTITY_ID!;
    const templateId = dltTemplateId || process.env.SMS_DLT_DEFAULT_TEMPLATE_ID || '';

    try {
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          phone,
          message,
          sender: senderId,
          entityId: dltEntityId,
          templateId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          status: 'failed',
          provider: this.name,
          error: `SMS Gateway returned HTTP ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const resData: any = await response.json().catch(() => ({}));
      return {
        success: true,
        status: 'sent',
        provider: this.name,
        messageId: resData.messageId || resData.id || `sms-${Date.now()}`,
      };
    } catch (err: any) {
      this.logger.error(`[SMS_DISPATCH_ERROR] Failed sending SMS: ${err.message}`);
      return {
        success: false,
        status: 'failed',
        provider: this.name,
        error: err.message,
      };
    }
  }
}

/**
 * Resolves active SMS provider based on environment configuration.
 * Returns null if no provider is configured.
 */
export function resolveSmsProvider(): SmsProvider | null {
  const providerType = (process.env.SMS_PROVIDER || '').trim().toLowerCase();

  if (providerType === 'console' && process.env.NODE_ENV !== 'production') {
    return new ConsoleSmsProvider();
  }

  if (providerType === 'indian_dlt' || (process.env.SMS_GATEWAY_URL && process.env.SMS_API_KEY)) {
    const dltProvider = new IndianDltSmsProvider();
    if (dltProvider.isConfigured()) {
      return dltProvider;
    }
  }

  return null;
}
