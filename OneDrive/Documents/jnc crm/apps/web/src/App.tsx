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
import OrdersPage from './pages/OrdersPage';
import InventoryPage from './pages/InventoryPage';
import SuppliersPage from './pages/SuppliersPage';
import ShipmentsPage from './pages/ShipmentsPage';
import QuotationsPage from './pages/QuotationsPage';
import AutomationPage from './pages/AutomationPage';
import UsersPage from './pages/UsersPage';
import ObjectManagerPage from './pages/ObjectManagerPage';
import CustomObjectRecordsPage from './pages/CustomObjectRecordsPage';
import PublicInquiryPage from './pages/PublicInquiryPage';
import InvoicesPage from './pages/InvoicesPage';
import BrandingSettingsPage from './pages/BrandingSettingsPage';
import DailyActivitiesPage from './pages/DailyActivitiesPage';
import NotificationsPage from './pages/NotificationsPage';
import PlatformCompaniesPage from './pages/PlatformCompaniesPage';
import PlatformAdminsPage from './pages/PlatformAdminsPage';
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
    return <Navigate to="/login" replace />;
  }

  if (user?.mustResetPassword) {
    return <ForcePasswordResetPage />;
  }

  return <>{children}</>;
}

function PlatformOwnerGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isPlatformOwner(user)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RootLandingRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (isPlatformOwner(user)) {
    return <Navigate to="/platform/companies" replace />;
  }
  if (['developer', 'developer_lead', 'project_manager'].includes(user?.role || '')) {
    return <Navigate to="/daily-activities" replace />;
  }
  if (['client', 'customer'].includes(user?.role || '')) {
    return <Navigate to="/orders" replace />;
  }
  return <DashboardPage />;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={getRoleRedirectPath(user)} replace /> : <LoginPage />}
      />
      <Route path="/inquiry" element={<PublicInquiryPage />} />
      <Route path="/quote-request" element={<PublicInquiryPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeamPageGuard pageKey="dashboard"><RootLandingRoute /></TeamPageGuard>} />
        <Route path="leads" element={<TeamPageGuard pageKey="leads"><LeadsPage /></TeamPageGuard>} />
        <Route path="notifications" element={<TeamPageGuard pageKey="dashboard"><NotificationsPage /></TeamPageGuard>} />
        <Route path="orders" element={<TeamPageGuard pageKey="orders"><OrdersPage /></TeamPageGuard>} />
        <Route path="invoices" element={<TeamPageGuard pageKey="invoices"><InvoicesPage /></TeamPageGuard>} />
        <Route path="inventory" element={<TeamPageGuard pageKey="inventory"><InventoryPage /></TeamPageGuard>} />
        <Route path="suppliers" element={<TeamPageGuard pageKey="suppliers"><SuppliersPage /></TeamPageGuard>} />
        <Route path="shipments" element={<TeamPageGuard pageKey="shipments"><ShipmentsPage /></TeamPageGuard>} />
        <Route path="quotations" element={<TeamPageGuard pageKey="quotations"><QuotationsPage /></TeamPageGuard>} />
        <Route path="users" element={<TeamPageGuard pageKey="users"><UsersPage /></TeamPageGuard>} />
        <Route path="platform/companies" element={<PlatformOwnerGuard><PlatformCompaniesPage /></PlatformOwnerGuard>} />
        <Route path="platform/admins" element={<PlatformOwnerGuard><PlatformAdminsPage /></PlatformOwnerGuard>} />
        <Route path="settings/branding" element={<TeamPageGuard pageKey="users"><BrandingSettingsPage /></TeamPageGuard>} />
        <Route path="automation" element={<TeamPageGuard pageKey="automation"><AutomationPage /></TeamPageGuard>} />
        <Route path="setup/objects" element={<TeamPageGuard pageKey="custom_objects"><ObjectManagerPage /></TeamPageGuard>} />
        <Route path="setup/objects/:objectId" element={<TeamPageGuard pageKey="custom_objects"><ObjectManagerPage /></TeamPageGuard>} />
        <Route path="objects/:objectApiName" element={<TeamPageGuard pageKey="custom_objects"><CustomObjectRecordsPage /></TeamPageGuard>} />
        <Route path="daily-activities" element={<TeamPageGuard pageKey="daily_activities"><DailyActivitiesPage /></TeamPageGuard>} />
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

