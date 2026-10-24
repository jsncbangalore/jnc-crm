/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';

/**
 * ResetPasswordPage
 * Legacy reset-password route redirected directly to /forgot-password
 * (No intermediate "links replaced with OTP" screen).
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const portalParam = searchParams.get('portal');
  const target = portalParam === 'platform' ? '/forgot-password?portal=platform' : '/forgot-password';

  useEffect(() => {
    navigate(target, { replace: true });
  }, [navigate, target]);

  return (
    <AuthLayout>
      <div className="flex items-center justify-center p-8">
        <span className="text-slate-500 dark:text-slate-400 text-sm">Redirecting to password reset...</span>
      </div>
    </AuthLayout>
  );
}
