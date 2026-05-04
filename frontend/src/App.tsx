import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore, Role } from './store/useStore';

// Public pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

// Layouts
import AdminLayout from './components/AdminLayout';
import ClientLayout from './components/ClientLayout';

// Admin pages
import AdminDashboardPage from './pages/admin/DashboardPage';
import CredentialsPage from './pages/CredentialsPage';
import VaultFactoryPage from './pages/VaultFactoryPage';
import MandatePage from './pages/MandatePage';
import FundingPage from './pages/FundingPage';
import ExecutionPage from './pages/ExecutionPage';
import CompliancePage from './pages/CompliancePage';
import EmergencyPage from './pages/EmergencyPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import TransparencyPage from './pages/admin/TransparencyPage';
import ArchitecturePage from './pages/admin/ArchitecturePage';
import TranslationPipelinePage from './pages/admin/TranslationPipelinePage';
import FinstarLedgerPage from './pages/admin/FinstarLedgerPage';

// Client pages
import VaultOverviewPage from './pages/client/VaultOverviewPage';
import ConsentPage from './pages/client/ConsentPage';
import RampPage from './pages/client/RampPage';
import ActivityPage from './pages/client/ActivityPage';
import RequestCredentialPage from './pages/client/RequestCredentialPage';
import MyVaultsPage from './pages/client/MyVaultsPage';
import VaultDetailPage from './pages/client/VaultDetailPage';
import ClientMandatePage from './pages/client/ClientMandatePage';

// Role → allowed routes
const roleAccess: Record<Role, string[]> = {
  admin: ['/amina', '/amina/credentials', '/amina/vault-factory', '/amina/mandate', '/amina/funding', '/amina/compliance', '/amina/audit-log', '/amina/transparency', '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger'],
  portfolio_manager: ['/amina', '/amina/mandate', '/amina/execution', '/amina/compliance', '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger'],
  compliance_officer: ['/amina', '/amina/compliance', '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger'],
  emergency_admin: ['/amina', '/amina/emergency', '/amina/compliance', '/amina/architecture'],
  client_representative: [],
};

function RequireAuth({ children, portal }: { children: React.ReactNode; portal: 'amina' | 'client' }) {
  const { isAuthenticated, portal: currentPortal } = useStore();
  if (!isAuthenticated || currentPortal !== portal) {
    return <Navigate to={`/login/${portal}`} replace />;
  }
  return <>{children}</>;
}

function RequireRole({ children, route }: { children: React.ReactNode; route: string }) {
  const { currentRole } = useStore();
  const allowed = roleAccess[currentRole] || [];
  if (!allowed.includes(route)) {
    return <AccessDenied role={currentRole} route={route} />;
  }
  return <>{children}</>;
}

function AccessDenied({ role, route }: { role: Role; route: string }) {
  const roleLabels: Record<Role, string> = {
    admin: 'Bank Admin',
    portfolio_manager: 'Portfolio Manager',
    compliance_officer: 'Compliance Officer',
    client_representative: 'Client Representative',
    emergency_admin: 'Emergency Admin',
  };

  const rolePages: Record<Role, { label: string; path: string }[]> = {
    admin: [
      { label: 'Credentials', path: '/amina/credentials' },
      { label: 'Vault Factory', path: '/amina/vault-factory' },
      { label: 'Mandate Details', path: '/amina/mandate' },
      { label: 'Vault Funding', path: '/amina/funding' },
      { label: 'Compliance', path: '/amina/compliance' },
      { label: 'Audit Log', path: '/amina/audit-log' },
      { label: 'Transparency', path: '/amina/transparency' },
      { label: 'Architecture', path: '/amina/architecture' },
      { label: 'Translation Pipeline', path: '/amina/translation-pipeline' },
      { label: 'Finstar Ledger', path: '/amina/finstar-ledger' },
    ],
    portfolio_manager: [
      { label: 'Mandate Details', path: '/amina/mandate' },
      { label: 'Execution', path: '/amina/execution' },
      { label: 'Compliance', path: '/amina/compliance' },
      { label: 'Architecture', path: '/amina/architecture' },
      { label: 'Translation Pipeline', path: '/amina/translation-pipeline' },
      { label: 'Finstar Ledger', path: '/amina/finstar-ledger' },
    ],
    compliance_officer: [
      { label: 'Compliance', path: '/amina/compliance' },
      { label: 'Architecture', path: '/amina/architecture' },
      { label: 'Translation Pipeline', path: '/amina/translation-pipeline' },
      { label: 'Finstar Ledger', path: '/amina/finstar-ledger' },
    ],
    emergency_admin: [
      { label: 'Emergency Controls', path: '/amina/emergency' },
      { label: 'Compliance', path: '/amina/compliance' },
      { label: 'Architecture', path: '/amina/architecture' },
    ],
    client_representative: [],
  };

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-5">
        <div className="w-14 h-14 rounded-full bg-error-100 border border-error-700/20 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-error-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-bold text-ink-900">Access Restricted</h2>
          <p className="text-sm text-slate-700 mt-1">
            Your current role <span className="text-ink-900 font-medium">({roleLabels[role]})</span> does not have permission to access <span className="text-ink-900 font-mono text-xs">{route}</span>.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-[18px] p-4 text-left shadow-1">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Pages available to you</p>
          <div className="space-y-1.5">
            <a href="/amina" className="flex items-center gap-2 text-xs text-slate-700 hover:text-teal-700 transition-colors">
              <span className="w-1 h-1 rounded-full bg-teal-700" /> Dashboard
            </a>
            {(rolePages[role] || []).map((p) => (
              <a key={p.path} href={p.path} className="flex items-center gap-2 text-xs text-slate-700 hover:text-teal-700 transition-colors">
                <span className="w-1 h-1 rounded-full bg-teal-700" /> {p.label}
              </a>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-slate-500">
          Switch roles from the sidebar to access other areas, or contact your administrator.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login/:portal" element={<LoginPage />} />

      {/* AMINA Admin routes */}
      <Route
        path="/amina"
        element={
          <RequireAuth portal="amina">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="credentials" element={<RequireRole route="/amina/credentials"><CredentialsPage /></RequireRole>} />
        <Route path="vault-factory" element={<RequireRole route="/amina/vault-factory"><VaultFactoryPage /></RequireRole>} />
        <Route path="mandate" element={<RequireRole route="/amina/mandate"><MandatePage /></RequireRole>} />
        <Route path="funding" element={<RequireRole route="/amina/funding"><FundingPage /></RequireRole>} />
        <Route path="execution" element={<RequireRole route="/amina/execution"><ExecutionPage /></RequireRole>} />
        <Route path="compliance" element={<RequireRole route="/amina/compliance"><CompliancePage /></RequireRole>} />
        <Route path="emergency" element={<RequireRole route="/amina/emergency"><EmergencyPage /></RequireRole>} />
        <Route path="audit-log" element={<RequireRole route="/amina/audit-log"><AuditLogPage /></RequireRole>} />
        <Route path="transparency" element={<RequireRole route="/amina/transparency"><TransparencyPage /></RequireRole>} />
        <Route path="architecture" element={<RequireRole route="/amina/architecture"><ArchitecturePage /></RequireRole>} />
        <Route path="translation-pipeline" element={<RequireRole route="/amina/translation-pipeline"><TranslationPipelinePage /></RequireRole>} />
        <Route path="finstar-ledger" element={<RequireRole route="/amina/finstar-ledger"><FinstarLedgerPage /></RequireRole>} />
      </Route>

      {/* Client routes */}
      <Route
        path="/client"
        element={
          <RequireAuth portal="client">
            <ClientLayout />
          </RequireAuth>
        }
      >
        <Route index element={<VaultOverviewPage />} />
        <Route path="vaults" element={<MyVaultsPage />} />
        <Route path="vaults/:id" element={<VaultDetailPage />} />
        <Route path="request-credential" element={<RequestCredentialPage />} />
        <Route path="mandate" element={<ClientMandatePage />} />
        <Route path="consent" element={<ConsentPage />} />
        <Route path="ramp" element={<RampPage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
