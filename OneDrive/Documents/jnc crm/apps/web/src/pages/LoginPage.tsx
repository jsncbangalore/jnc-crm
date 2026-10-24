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
import { isPlatformOwner, getRoleRedirectPath } from '../utils/roles';

export { getRoleRedirectPath };

export default function LoginPage() {
  const { isAuthenticated, user, isLoading } = useAuth();

  // If already authenticated, redirect directly to user workspace
  if (!isLoading && isAuthenticated && user) {
    const dest = (isPlatformOwner(user) || user.role === 'platform_super_admin') && !user.tenantId
      ? '/platform/companies'
      : getRoleRedirectPath(user);
    return <Navigate to={dest} replace />;
  }

  return (
    <AuthLayout>
      <AuthLoginForm portal="company" />
    </AuthLayout>
  );
}
