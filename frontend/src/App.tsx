// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// SPA-ийн маршрутын хүснэгт. Next.js-ийн файлын бүтэц дээр суурилсан замууд
// ЯГ хэвээр хадгалагдсан (гадаад холбоос, SSO redirect, nginx дүрэм бүгд
// тэдгээрээс хамаардаг).
//
// Хамгаалалт нь ЭНД, нэг дор: `RequireAuth` нь нэвтрэлт, `RequirePermission`
// нь RBAC эрхийг шаардана. Хуудсууд өөрсдөө шалгалт хийхээ больсон тул
// "хамгаалалт мартагдах" алдаа бүтцийн хувьд боломжгүй. Жинхэнэ шийдвэр нь
// ямагт backend талд — энэ нь зөвхөн UI-ийн зөв чиглүүлэлт.

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import AreaShell from '@/components/AreaShell';
import { RequireAuth, RequirePermission } from '@/components/RequireAuth';
import SigninShell from '@/components/SigninShell';
import { LangProvider } from '@/lib/lang';
import { SessionProvider } from '@/lib/session';

import HomePage from '@/app/page';
import AdminApplicationsPage from '@/app/admin/applications/page';
import AdminAuditPage from '@/app/admin/audit/page';
import AdminCorePage from '@/app/admin/core/page';
import AdminDashboardPage from '@/app/admin/dashboard/page';
import AdminGatewayLogsPage from '@/app/admin/gateway/logs/page';
import AdminGatewayOverviewPage from '@/app/admin/gateway/overview/page';
import AdminGatewayServicesPage from '@/app/admin/gateway/services/page';
import AdminRegistryPage from '@/app/admin/registry/page';
import AdminRegistryEvidencesPage from '@/app/admin/registry/evidences/page';
import AdminRegistryServicesPage from '@/app/admin/registry/services/page';
import AdminRegistryServicesByIdPage from '@/app/admin/registry/services/[id]/page';
import AdminRelayPage from '@/app/admin/relay/page';
import AdminRelayByIdPage from '@/app/admin/relay/[id]/page';
import AdminRelayConfigPage from '@/app/admin/relay/config/page';
import AdminRolesPage from '@/app/admin/roles/page';
import AdminSecurityPage from '@/app/admin/security/page';
import AdminSettingsPage from '@/app/admin/settings/page';
import AdminSuperadminPage from '@/app/admin/superadmin/page';
import AdminThemesPage from '@/app/admin/themes/page';
import AdminUsersPage from '@/app/admin/users/page';
import AppEidCallbackPage from '@/app/app/eid/callback/page';
import AuthEidCallbackPage from '@/app/auth/eid/callback/page';
import LoginPage from '@/app/login/page';
import SsoCallbackPage from '@/app/sso/callback/page';
import LoginVerifyPage from '@/app/login/verify/page';
import ManagerDashboardPage from '@/app/manager/dashboard/page';
import ManagerRequestsPage from '@/app/manager/requests/page';
import ManagerUsersPage from '@/app/manager/users/page';
import MeAiPage from '@/app/me/ai/page';
import MeApplicationsPage from '@/app/me/applications/page';
import MeAppointmentsPage from '@/app/me/appointments/page';
import MeDashboardPage from '@/app/me/dashboard/page';
import MeEidCertificatesPage from '@/app/me/eid/certificates/page';
import MeEidDevicesPage from '@/app/me/eid/devices/page';
import MeEidIdPage from '@/app/me/eid/id/page';
import MeEidLogsPage from '@/app/me/eid/logs/page';
import MeEidSecurityPage from '@/app/me/eid/security/page';
import MeEidSignPage from '@/app/me/eid/sign/page';
import MeIntegrationsPage from '@/app/me/integrations/page';
import MeNotificationsPage from '@/app/me/notifications/page';
import MeOrganizationsPage from '@/app/me/organizations/page';
import MeOrganizationsByIdPage from '@/app/me/organizations/[id]/page';
import MeOrganizationsEidByRegnoPage from '@/app/me/organizations/eid/[regNo]/page';
import MePaymentsPage from '@/app/me/payments/page';
import MeProfilePage from '@/app/me/profile/page';
import MeReferencesPage from '@/app/me/references/page';
import MeServicesPage from '@/app/me/services/page';
import MeSettingsPage from '@/app/me/settings/page';
import MeTranslatePage from '@/app/me/translate/page';
import OauthConsentPage from '@/app/oauth/consent/page';
import OauthErrorPage from '@/app/oauth/error/page';
import OauthLoginPage from '@/app/oauth/login/page';
import OauthLogoutPage from '@/app/oauth/logout/page';
import ProfilePage from '@/app/profile/page';
import SettingsPage from '@/app/settings/page';
import SuperadminLoginPage from '@/app/superadmin/login/page';
import SuperadminOnboardPage from '@/app/superadmin/onboard/page';

/** queryClient нь бүх GET өгөгдлийн кэш (хуудас солиход дахин татахгүй). */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/** areaLayout нь нэвтэрсэн бүсийн бүрхүүл (хажуугийн цэс + толгой). */
function AreaLayout({ next }: { next: string }): React.ReactElement {
  return (
    <AreaShell next={next}>
      <Outlet />
    </AreaShell>
  );
}

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <BrowserRouter>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </BrowserRouter>
      </LangProvider>
    </QueryClientProvider>
  );
}

function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/app/eid/callback" element={<AppEidCallbackPage />} />
      <Route path="/auth/eid/callback" element={<AuthEidCallbackPage />} />
      {/* Government SSO-д бүртгэгдсэн redirect_uri — энэ маршрут байхгүй бол
          catch-all нь ?code-ыг залгиж нэвтрэлт чимээгүй унана. */}
      <Route path="/sso/callback" element={<SsoCallbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/verify" element={<LoginVerifyPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/superadmin/login" element={<SuperadminLoginPage />} />
      <Route path="/superadmin/onboard" element={<SuperadminOnboardPage />} />

      {/* OIDC зөвшөөрлийн хуудсууд — нэвтрэх картын бүрхүүлтэй. */}
      <Route
        element={
          <SigninShell>
            <Outlet />
          </SigninShell>
        }
      >
        <Route path="/oauth/consent" element={<OauthConsentPage />} />
        <Route path="/oauth/error" element={<OauthErrorPage />} />
        <Route path="/oauth/login" element={<OauthLoginPage />} />
        <Route path="/oauth/logout" element={<OauthLogoutPage />} />
      </Route>

      {/* /me бүс — нэвтэрсэн байх ШААРДЛАГАТАЙ. */}
      <Route
        path="/me"
        element={
          <RequireAuth>
            <AreaLayout next="/me/dashboard" />
          </RequireAuth>
        }
      >
          <Route path="ai" element={<MeAiPage />} />
          <Route path="applications" element={<MeApplicationsPage />} />
          <Route path="appointments" element={<MeAppointmentsPage />} />
          <Route path="dashboard" element={<MeDashboardPage />} />
          <Route path="eid/certificates" element={<MeEidCertificatesPage />} />
          <Route path="eid/devices" element={<MeEidDevicesPage />} />
          <Route path="eid/id" element={<MeEidIdPage />} />
          <Route path="eid/logs" element={<MeEidLogsPage />} />
          <Route path="eid/security" element={<MeEidSecurityPage />} />
          <Route path="eid/sign" element={<MeEidSignPage />} />
          <Route path="integrations" element={<MeIntegrationsPage />} />
          <Route path="notifications" element={<MeNotificationsPage />} />
          <Route path="organizations" element={<MeOrganizationsPage />} />
          <Route path="organizations/:id" element={<MeOrganizationsByIdPage />} />
          <Route path="organizations/eid/:regNo" element={<MeOrganizationsEidByRegnoPage />} />
          <Route path="payments" element={<MePaymentsPage />} />
          <Route path="profile" element={<MeProfilePage />} />
          <Route path="references" element={<MeReferencesPage />} />
          <Route path="services" element={<MeServicesPage />} />
          <Route path="settings" element={<MeSettingsPage />} />
          <Route path="translate" element={<MeTranslatePage />} />
      </Route>

      {/* /admin бүс — нэвтэрсэн байх ШААРДЛАГАТАЙ. */}
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AreaLayout next="/admin/dashboard" />
          </RequireAuth>
        }
      >
          <Route path="applications" element={<RequirePermission permission="gateway.manage"><AdminApplicationsPage /></RequirePermission>} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route path="core" element={<RequirePermission permission="users.manage"><AdminCorePage /></RequirePermission>} />
          <Route path="dashboard" element={<RequirePermission permission="dashboard.view"><AdminDashboardPage /></RequirePermission>} />
          <Route path="gateway/logs" element={<RequirePermission permission="gateway.manage"><AdminGatewayLogsPage /></RequirePermission>} />
          <Route path="gateway/overview" element={<RequirePermission permission="gateway.manage"><AdminGatewayOverviewPage /></RequirePermission>} />
          <Route path="gateway/services" element={<RequirePermission permission="gateway.manage"><AdminGatewayServicesPage /></RequirePermission>} />
          <Route path="registry" element={<RequirePermission permission="registry.view"><AdminRegistryPage /></RequirePermission>} />
          <Route path="registry/evidences" element={<RequirePermission permission="registry.view"><AdminRegistryEvidencesPage /></RequirePermission>} />
          <Route path="registry/services" element={<RequirePermission permission="registry.view"><AdminRegistryServicesPage /></RequirePermission>} />
          <Route path="registry/services/:id" element={<RequirePermission permission="registry.view"><AdminRegistryServicesByIdPage /></RequirePermission>} />
          <Route path="relay" element={<RequirePermission permission="relay.view"><AdminRelayPage /></RequirePermission>} />
          <Route path="relay/:id" element={<RequirePermission permission="relay.view"><AdminRelayByIdPage /></RequirePermission>} />
          <Route path="relay/config" element={<RequirePermission permission="relay.view"><AdminRelayConfigPage /></RequirePermission>} />
          <Route path="roles" element={<RequirePermission permission="roles.manage"><AdminRolesPage /></RequirePermission>} />
          <Route path="security" element={<AdminSecurityPage />} />
          <Route path="settings" element={<RequirePermission permission="settings.manage"><AdminSettingsPage /></RequirePermission>} />
          <Route path="superadmin" element={<AdminSuperadminPage />} />
          <Route path="themes" element={<RequirePermission permission="settings.manage"><AdminThemesPage /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users.manage"><AdminUsersPage /></RequirePermission>} />
      </Route>

      {/* /manager бүс — нэвтэрсэн байх ШААРДЛАГАТАЙ. */}
      <Route
        path="/manager"
        element={
          <RequireAuth>
            <AreaLayout next="/manager/dashboard" />
          </RequireAuth>
        }
      >
          <Route path="dashboard" element={<RequirePermission permission="manager.view"><ManagerDashboardPage /></RequirePermission>} />
          <Route path="requests" element={<RequirePermission permission="gov.review"><ManagerRequestsPage /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users.manage"><ManagerUsersPage /></RequirePermission>} />
      </Route>

      {/* Танигдаагүй зам — нүүр рүү. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
