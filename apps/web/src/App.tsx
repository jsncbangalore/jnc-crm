import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAllowedPages } from './hooks/useAllowedPages';
import AppLayout from './components/layout/AppLayout';
import TeamPageGuard from './components/layout/TeamPageGuard';
import ForcePasswordResetPage from './pages/ForcePasswordResetPage';
import { isPlatformOwner, getRoleRedirectPath } from './utils/roles';
import { getImpersonationAccessToken } from './services/api';
import LandingPage from './pages/LandingPage';
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
import LedgerPage from './pages/LedgerPage';
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
import CookieConsentPage from './pages/CookieConsentPage';
import FeaturesPage from './pages/FeaturesPage';
import SolutionsPage from './pages/SolutionsPage';
import PricingPage from './pages/PricingPage';
import HelpPage from './pages/HelpPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import ContactPage from './pages/ContactPage';
import DedicatedPrintPage from './pages/DedicatedPrintPage';
import CookieConsentBanner from './components/common/CookieConsentBanner';
import ReconnectingBanner from './components/common/ReconnectingBanner';
import RobotsMetaHandler from './components/common/RobotsMetaHandler';
import { PopupProvider } from './contexts/PopupContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BrandingProvider } from './contexts/BrandingContext';
import { checkApiCompatibility } from './utils/versionCheck';
import { Clock } from 'lucide-react';

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
    return <Navigate to="/login" replace />;
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
  const isImpersonating = Boolean((user as any)?.isImpersonating || getImpersonationAccessToken());

  if ((isPlatformOwner(user) || user?.role === 'platform_super_admin') && !user?.tenantId && !isImpersonating) {
    return <Navigate to="/platform/companies" replace />;
  }
  return <>{children}</>;
}

function RootLandingRoute() {
  const { hasPage, homePageRoute } = useAllowedPages();
  if (hasPage('dashboard')) {
    return <DashboardPage />;
  }
  return <Navigate to={homePageRoute} replace />;
}

function RootIndexRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { hasZeroPages, hasPage, homePageRoute } = useAllowedPages();

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

  // Not logged in -> Show Public Index (Marketing / Landing) Page
  if (!isAuthenticated || !user) {
    return <LandingPage />;
  }

  // Zero pages granted -> Show standalone NoAccessGranted screen with NO navigation surfaces (Requirement 2)
  if (hasZeroPages) {
    return (
      <TeamPageGuard pageKey="dashboard">
        <div />
      </TeamPageGuard>
    );
  }

  // User does NOT have dashboard permission -> Redirect directly to their home page (Requirement 2 & 6)
  if (!hasPage('dashboard')) {
    return <Navigate to={homePageRoute} replace />;
  }

  // Logged in with dashboard permission -> Forward to /dashboard
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (!isLoading && isAuthenticated && user?.mustResetPassword) {
    return <ForcePasswordResetPage />;
  }

  return (
    <Routes>
      {/* Front root index: Landing Page when not logged in, Dashboard when logged in */}
      <Route path="/" element={<RootIndexRoute />} />
      <Route path="/index" element={<RootIndexRoute />} />
      <Route path="/index.html" element={<RootIndexRoute />} />
      <Route path="/home" element={<RootIndexRoute />} />

      {/* Public Pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/solutions" element={<SolutionsPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/privacy-policy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/terms-of-service" element={<TermsPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/contact-us" element={<ContactPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/start" element={<Navigate to="/login" replace />} />
      <Route path="/inquiry" element={<PublicInquiryPage />} />
      <Route path="/quote-request" element={<PublicInquiryPage />} />
      <Route path="/cookies" element={<CookieConsentPage />} />
      <Route path="/cookie-policy" element={<CookieConsentPage />} />
      <Route path="/shared-cart" element={<SharedCartPage />} />
      <Route path="/cart-share" element={<SharedCartPage />} />
      <Route path="/cart" element={<SharedCartPage />} />
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />

      {/* Dedicated Standalone Print Route (No app chrome, zero popup delay) */}
      <Route
        path="/print/:docType/:id"
        element={
          <ProtectedRoute>
            <DedicatedPrintPage />
          </ProtectedRoute>
        }
      />

      {/* Standalone Protected Settings & Setup Routes */}
      <Route
        path="/start-setup"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="lead_setup">
              <CrmRouteGuard>
                <StartSetupPage />
              </CrmRouteGuard>
            </TeamPageGuard>
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
        path="/audit-logs"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="audit_logs">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="audit" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/security-logs"
        element={<Navigate to="/audit-logs" replace />}
      />
      <Route
        path="/settings/branding"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="branding">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="branding" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/mail"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="mail_settings">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="mail" />
              </CrmRouteGuard>
            </TeamPageGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/mail-accounts"
        element={
          <ProtectedRoute>
            <TeamPageGuard pageKey="mail_settings">
              <CrmRouteGuard>
                <AdminSettingsPage initialTab="mail" />
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

      {/* Authenticated Workspace Layout */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<TeamPageGuard pageKey="dashboard"><CrmRouteGuard><DashboardPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/leads" element={<TeamPageGuard pageKey="leads"><CrmRouteGuard><LeadsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/lead-flow" element={<Navigate to="/start-setup" replace />} />
        <Route path="/lead-setup" element={<Navigate to="/start-setup" replace />} />
        <Route path="/notifications" element={<TeamPageGuard pageKey="notifications"><CrmRouteGuard><NotificationsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/orders" element={<TeamPageGuard pageKey="orders"><CrmRouteGuard><OrdersPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/invoices" element={<TeamPageGuard pageKey="invoices"><CrmRouteGuard><InvoicesPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/ledger" element={<TeamPageGuard pageKey="ledger"><CrmRouteGuard><LedgerPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/inventory" element={<TeamPageGuard pageKey="inventory"><CrmRouteGuard><InventoryPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/bills" element={<TeamPageGuard pageKey="bills"><CrmRouteGuard><PurchaseBillsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/purchase-bills" element={<Navigate to="/bills" replace />} />
        <Route path="/suppliers" element={<TeamPageGuard pageKey="suppliers"><CrmRouteGuard><SuppliersPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/shipments" element={<TeamPageGuard pageKey="shipments"><CrmRouteGuard><ShipmentsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/quotations" element={<TeamPageGuard pageKey="quotations"><CrmRouteGuard><QuotationsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/platform/companies" element={<PlatformOwnerGuard><PlatformCompaniesPage /></PlatformOwnerGuard>} />
        <Route path="/platform/admins" element={<PlatformOwnerGuard><PlatformAdminsPage /></PlatformOwnerGuard>} />
        <Route path="/automation" element={<TeamPageGuard pageKey="automation"><CrmRouteGuard><AutomationPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/setup/objects" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><ObjectManagerPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/setup/objects/:objectId" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><ObjectManagerPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/objects/:objectApiName" element={<TeamPageGuard pageKey="custom_objects"><CrmRouteGuard><CustomObjectRecordsPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/daily-activities" element={<TeamPageGuard pageKey="daily_activities"><CrmRouteGuard><DailyActivitiesPage /></CrmRouteGuard></TeamPageGuard>} />
        <Route path="/account" element={<MyAccountPage />} />
      </Route>

      {/* Fallback route outside of ProtectedRoute to prevent unauthorized bounce to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function MaintenanceNoticeBanner() {
  const [isOutdated, setIsOutdated] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    checkApiCompatibility().then((res) => {
      if (!isMounted) return;
      if (res.isOutdated) {
        setIsOutdated(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!isOutdated) return null;

  return (
    <aside aria-label="System Notice" className="sticky top-0 z-[9999] bg-amber-600 text-white text-center py-2.5 px-4 text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-2">
      <Clock size={16} className="shrink-0" />
      <span>We are updating the system. Please try again in a few minutes.</span>
    </aside>
  );
}

export default function App() {
  React.useEffect(() => {
    // Handle body margins, padding, and stable scrollbar gutter purely in React
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.documentElement.style.scrollbarGutter = 'stable';
    return () => {
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.documentElement.style.scrollbarGutter = '';
    };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrandingProvider>
          <PopupProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <RobotsMetaHandler />
              <ReconnectingBanner />
              <MaintenanceNoticeBanner />
              <AppRoutes />
              <CookieConsentBanner />
            </BrowserRouter>
          </PopupProvider>
        </BrandingProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

