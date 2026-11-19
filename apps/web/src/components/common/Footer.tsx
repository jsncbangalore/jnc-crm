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
import { useAuth } from '../../contexts/AuthContext';
import { isPlatformOwner } from '../../utils/roles';

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
  const auth = useAuth();
  const user = auth?.user;
  const isImpersonating = auth?.isImpersonating;

  const isPlatformConsole =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/platform');
  const isPlatformAdmin = Boolean(
    user && (isPlatformOwner(user) || user.role === 'platform_super_admin') && !isImpersonating
  );

  // Show web and API build ids only to signed-in platform administrators inside the platform console
  const showBuildIds = isPlatformConsole && isPlatformAdmin;

  useEffect(() => {
    if (!showBuildIds) return;
    let mounted = true;
    authApi
      .getPlatformHealth()
      .catch(() => authApi.getHealth())
      .then((res: any) => {
        if (mounted && res?.data?.commitId) {
          setApiCommitId(res.data.commitId);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [showBuildIds]);

  const cleanWeb = (webCommitId || '').trim().toLowerCase();
  const cleanApi = (apiCommitId || '').trim().toLowerCase();
  const web7 = cleanWeb.slice(0, 7);
  const api7 = cleanApi.slice(0, 7);

  const isIgnored = (id: string) => !id || ['dev', 'unknown', 'local-dev'].includes(id);

  // Fix comparison so equal ids never warn (trim, lowercase, compare first 7 characters)
  const isMismatch = Boolean(
    cleanApi &&
    cleanWeb &&
    !isIgnored(cleanWeb) &&
    !isIgnored(cleanApi) &&
    web7 !== api7
  );

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
        {showBuildIds && (
          <>
            <span aria-hidden="true" className="opacity-40">•</span>
            <div data-testid="footer-build-ids" className="flex items-center gap-1.5 text-[11px] font-mono">
              {isMismatch ? (
                <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  ⚠️ Build mismatch: Web {web7} / API {api7}
                </span>
              ) : (
                <span className="opacity-75">
                  Build {web7}
                </span>
              )}
            </div>
          </>
        )}
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
