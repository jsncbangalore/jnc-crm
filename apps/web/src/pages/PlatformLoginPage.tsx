/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import React from 'react';
import { Navigate } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import AuthLoginForm from '../components/auth/AuthLoginForm';
import { useAuth } from '../contexts/AuthContext';
import { isPlatformOwner } from '../utils/roles';

export default function PlatformLoginPage() {
  const { isAuthenticated, user, isLoading } = useAuth();

  // If already authenticated, redirect directly to platform portal
  if (!isLoading && isAuthenticated && user) {
    const dest = (isPlatformOwner(user) || user.role === 'platform_super_admin')
      ? '/platform/companies'
      : '/dashboard';
    return <Navigate to={dest} replace />;
  }

  return (
    <AuthLayout>
      <AuthLoginForm portal="platform" />
    </AuthLayout>
  );
}
