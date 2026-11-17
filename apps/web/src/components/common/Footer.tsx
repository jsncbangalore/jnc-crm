/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { openCookiePreferencesPanel } from '../../utils/cookieConsent';
import { authApi } from '../../services/api';

export interface FooterProps {
  className?: string;
  mobileDockOffset?: boolean;
  showCookieLinks?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  className = '',
  mobileDockOffset = false,
  showCookieLinks = true,
}) => {
  const [apiCommitId, setApiCommitId] = useState<string | null>(null);
  const webCommitId = (import.meta.env.VITE_GIT_COMMIT as string) || 'dev';

  useEffect(() => {
    let mounted = true;
    authApi
      .getHealth()
      .then((res) => {
        if (mounted && res?.data?.commitId) {
          setApiCommitId(res.data.commitId);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const isMismatch = Boolean(apiCommitId && webCommitId && !['dev', 'unknown', 'local-dev'].includes(webCommitId) && !['dev', 'unknown', 'local-dev'].includes(apiCommitId) && apiCommitId !== webCommitId);

  return (
    <footer
      data-testid="global-footer"
      className={`w-full py-3 px-4 sm:px-6 border-t border-slate-200 dark:border-[#2A3042] bg-white/70 dark:bg-[#181B26]/70 backdrop-blur-xs text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center ${
        showCookieLinks ? 'justify-between' : 'justify-center sm:justify-start'
      } gap-2.5 transition-colors duration-150 shrink-0 ${
        mobileDockOffset ? 'mb-14 lg:mb-0' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span data-testid="footer-copyright-text">{BRAND.copyright}</span>
        <span aria-hidden="true" className="opacity-40">•</span>
        <div data-testid="footer-build-ids" className="flex items-center gap-1.5 text-[11px] font-mono">
          {isMismatch ? (
            <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              ⚠️ Build mismatch: Web {webCommitId.slice(0, 7)} / API {apiCommitId?.slice(0, 7)}
            </span>
          ) : (
            <span className="opacity-75">
              Build {webCommitId.slice(0, 7)}{apiCommitId && apiCommitId !== webCommitId ? ` (API: ${apiCommitId.slice(0, 7)})` : ''}
            </span>
          )}
        </div>
      </div>
      {showCookieLinks && (
        <div className="flex items-center gap-3 sm:gap-4 text-xs" data-testid="footer-cookie-links-container">
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
      )}
    </footer>
  );
};

export default Footer;
