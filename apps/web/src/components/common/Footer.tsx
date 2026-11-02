/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { openCookiePreferencesPanel } from '../../utils/cookieConsent';

export interface FooterProps {
  className?: string;
  mobileDockOffset?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ className = '', mobileDockOffset = false }) => {
  return (
    <footer
      data-testid="global-footer"
      className={`w-full py-3 px-4 sm:px-6 border-t border-slate-200 dark:border-[#2A3042] bg-white/70 dark:bg-[#181B26]/70 backdrop-blur-xs text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2.5 transition-colors duration-150 shrink-0 ${
        mobileDockOffset ? 'mb-14 lg:mb-0' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-2">
        <span data-testid="footer-copyright-text">{BRAND.copyright}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 text-xs">
        <button
          type="button"
          onClick={() => openCookiePreferencesPanel()}
          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer text-xs"
          data-testid="footer-cookie-settings"
        >
          Cookie settings
        </button>
        <span aria-hidden="true">•</span>
        <Link
          to="/cookies"
          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          data-testid="footer-cookie-details"
        >
          Cookie details
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
