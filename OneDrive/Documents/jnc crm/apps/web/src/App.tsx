import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import TeamPageGuard from './components/layout/TeamPageGuard';
import ForcePasswordResetPage from './pages/ForcePasswordResetPage';
import { isPlatformOwner, getRoleRedirectPath } from './utils/roles';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadFlowPage from './pages/LeadFlowPage';
import StartSetupPage from './pages/StartSetupPage';
import OrdersPage from './pages/OrdersPage';
import InventoryPage from './pages/InventoryPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchaseBillsPage from './pages/PurchaseBillsPage';
import ShipmentsPage from './pages/ShipmentsPage';
import QuotationsPage from './pages/QuotationsPage';
import AutomationPage from './pages/AutomationPage';
import UsersPage from './pages/UsersPage';
import ObjectManagerPage from './pages/ObjectManagerPage';
import CustomObjectRecordsPage from './pages/CustomObjectRecordsPage';
import PublicInquiryPage from './pages/PublicInquiryPage';
import InvoicesPage from './pages/InvoicesPage';
import BrandingSettingsPage from './pages/BrandingSettingsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import SharedCartPage from './pages/SharedCartPage';
import DailyActivitiesPage from './pages/DailyActivitiesPage';
import NotificationsPage from './pages/NotificationsPage';
import PlatformCompaniesPage from './pages/PlatformCompaniesPage';
import PlatformAdminsPage from './pages/PlatformAdminsPage';
import PlatformLoginPage from './pages/PlatformLoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import MyAccountPage from './pages/MyAccountPage';
import { PopupProvider } from './contexts/PopupContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BrandingProvider } from './contexts/BrandingContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-crm-blue-DEFAULT/20 border border-crm-blue-DEFAULT/30 flex items-center justify-center">
            <span className="text-lg font-black text-crm-blue-DEFAULT">J</span>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-crm-blue-DEFAULT/60 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const isPlatformPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/platform');
    return <Navigate to={isPlatformPath ? "/platform/login" : "/login"} replace />;
  }

  if (user?.mustResetPassword) {
    return <ForcePasswordResetPage />;
  }

  return <>{children}</>;
}

function PlatformOwnerGuard({ children }: { children: React.ReactNode }) {
  const { user, staffUser } = useAuth();
  const currentUser = user || staffUser;

  if (!currentUser || !isPlatformOwner(currentUser)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <span className="text-xl font-bold">!</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Portal Access Notice
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This is the client-company portal. Use the team login.
          </p>
          <div>
            <a
              href="/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all"
            >
              Go to Team Login
            </a>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function CrmRouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isImpersonating =
    typeof window !== 'undefined' && !!sessionStorage.getItem('jnc_impersonate_token');

  if ((isPlatformOwner(user) || user?.role === 'platform_super_admin') && !user?.tenantId && !isImpersonating) {
    return <Navigate to="/platform/companies" replace />;
  }
  return <>{children}</>;
}

function RootLandingRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (['developer', 'developer_lead', 'project_manager'].includes(user?.role || '')) {
    return <Navigate to="/daily-activities" replace />;
  }
  if (['client', 'customer'].includes(user?.role || '')) {
    return <Navigate to="/orders" replace />;
  }
  return <DashboardPage />;
}

function AppRoutes() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (!isLoading && isAuthenticated && user?.mustResetPassword) {
    return <ForcePasswordResetPage />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={isPlatformOwner(user) ? "/platform/companies" : getRoleRedirectPath(user)} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route path="/inquiry" element={<PublicInquiryPage />} />
      <Route path="/quote-request" element={<PublicInquiryPage />} />
      <Route path="/shared-cart" element={<SharedCartPage />} />
      <Route path="/cart-share" element={<SharedCartPage />} />
      <Route path="/cart" element={<SharedCartPage />} />
      <Route
        path="/platform/login"
        element={
          isAuthenticated ? (
            <Navigate to={isPlatformOwner(user) ? "/platform/companies" : getRoleRedirectPath(user)} replace />
          ) : (
            <PlatformLoginPage />
          )
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/start-setup"
        element={
          <ProtectedRoute>
            <CrmRouteGuard>
              <StartSetupPage />
            </CrmRouteGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="users">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="users" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/branding"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="users">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="branding" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="users">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="users" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeamPageGuard pageKey="dashboard"><CrmRouteGuard><RootLandingRoute /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="leads" element={<TeamPageGuard pageKey="leads"><CrmRouteGuard><LeadsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="lead-flow" element={<Navigate to="/start-setup" replace />} />
        <Route path="start-setup" element={<Navigate to="/start-setup" replace />} />
        <Route path="lead-setup" element={<Navigate to="/start-setup" replace />} />
        <Route path="notifications" element={<TeamPageGuard pageKey="dashboard"><CrmRouteGuard><NotificationsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="orders" element={<TeamPageGuard pageKey="orders"><CrmRouteGuard><OrdersPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="invoices" element={<TeamPageGuard pageKey="invoices"><CrmRouteGuard><InvoicesPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="inventory" element={<TeamPageGuard pageKey="inventory"><CrmRouteGuard><InventoryPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="purchase-bills" element={<TeamPageGuard pageKey="purchase_bills"><CrmRouteGuard><PurchaseBillsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="suppliers" element={<Navigate to="/purchase-bills" replace />} />
        <Route path="shipments" element={<TeamPageGuard pageKey="shipments"><CrmRouteGuard><ShipmentsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="quotations" element={<TeamPageGuard pageKey="quotations"><CrmRouteGuard><QuotationsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="users" element={<Navigate to="/users" replace />} />
        <Route path="platform/companies" element={<PlatformOwnerGuard><PlatformCompaniesPage /></PlatformOwnerGuard>} />
        <Route path="platform/admins" element={<PlatformOwnerGuard><PlatformAdminsPage /></PlatformOwnerGuard>} />
        <Route path="settings/branding" element={<Navigate to="/settings/branding" replace />} />
        <Route path="automation" element={<TeamPageGuard pageKey="automation"><CrmRouteGuard><AutomationPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="setup/objects" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><ObjectManagerPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="setup/objects/:objectId" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><ObjectManagerPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="objects/:objectApiName" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><CustomObjectRecordsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="daily-activities" element={<TeamPageGuard pageKey="daily_activities"><CrmRouteGuard><DailyActivitiesPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="account" element={<MyAccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandingProvider>
          <PopupProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </PopupProvider>
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

