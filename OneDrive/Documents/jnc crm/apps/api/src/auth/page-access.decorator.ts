/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { SetMetadata } from '@nestjs/common';

export const PAGE_ACCESS_KEY = 'page_access';
export const PageAccess = (...pageKeys: string[]) =>
  SetMetadata(PAGE_ACCESS_KEY, pageKeys.length === 1 ? pageKeys[0] : pageKeys);

export const IS_PUBLIC_KEY = 'is_public_endpoint';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AUTH_ONLY_KEY = 'is_auth_only_endpoint';
export const AuthOnly = () => SetMetadata(AUTH_ONLY_KEY, true);
