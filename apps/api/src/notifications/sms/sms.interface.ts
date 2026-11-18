/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export interface SmsDispatchResult {
  success: boolean;
  status: 'sent' | 'failed' | 'not_configured';
  messageId?: string;
  error?: string;
  provider?: string;
}

export interface SmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendSms(phone: string, message: string, dltTemplateId?: string): Promise<SmsDispatchResult>;
}
