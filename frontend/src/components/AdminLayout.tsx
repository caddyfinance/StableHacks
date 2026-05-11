import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Shield,
  Building2,
  FileCheck,
  Wallet,
  TrendingUp,
  ClipboardCheck,
  AlertTriangle,
  LogOut,
  ChevronDown,
  ScrollText,
  Eye,
  Layers,
  ArrowRightLeft,
  Landmark,
  Activity,
  ShieldCheck,
  KeyRound,
  ArrowLeftRight,
  Presentation,
} from 'lucide-react';
import { useStore, Role, ROLE_LABELS, AMINA_ROLES } from '../store/useStore';

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    section: 'Overview',
    items: [
      { path: '/amina', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    section: 'Vault Operations',
    items: [
      { path: '/amina/credentials', label: 'Credentials', icon: Shield, end: false },
      { path: '/amina/vault-factory', label: 'Vault Factory', icon: Building2, end: false },
      { path: '/amina/mandate', label: 'Mandate Details', icon: FileCheck, end: false },
      { path: '/amina/funding', label: 'Vault Funding', icon: Wallet, end: false },
      { path: '/amina/execution', label: 'Execution', icon: TrendingUp, end: false },
    ],
  },
  {
    section: 'Compliance & Risk',
    items: [
      { path: '/amina/providers', label: 'Providers', icon: ShieldCheck, end: false },
      { path: '/amina/wallet-controllers', label: 'Wallet Controllers', icon: KeyRound, end: false },
      { path: '/amina/transfer-checks', label: 'Transfer Checks', icon: ArrowLeftRight, end: false },
      { path: '/amina/compliance', label: 'Compliance', icon: ClipboardCheck, end: false },
      { path: '/amina/audit-log', label: 'Audit Log', icon: ScrollText, end: false },
      { path: '/amina/transparency', label: 'Transparency', icon: Eye, end: false },
    ],
  },
  {
    section: 'Emergency',
    items: [
      { path: '/amina/emergency', label: '24/7 Incident Response', icon: AlertTriangle, end: false },
      { path: '/amina/operations', label: '24/7 Operations', icon: Activity, end: false },
    ],
  },
  {
    section: 'Infrastructure',
    items: [
      { path: '/amina/architecture', label: 'Architecture', icon: Layers, end: false },
      { path: '/amina/translation-pipeline', label: 'Translation Pipeline', icon: ArrowRightLeft, end: false },
      { path: '/amina/finstar-ledger', label: 'Finstar Ledger', icon: Landmark, end: false },
    ],
  },
];

const roleAccess: Record<Role, string[]> = {
  admin: [
    '/amina',
    '/amina/credentials', '/amina/vault-factory', '/amina/mandate', '/amina/funding',
    '/amina/providers', '/amina/wallet-controllers', '/amina/transfer-checks',
    '/amina/compliance', '/amina/audit-log', '/amina/transparency',
    '/amina/operations',
    '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger',
  ],
  portfolio_manager: [
    '/amina',
    '/amina/mandate', '/amina/funding', '/amina/execution',
    '/amina/providers', '/amina/transfer-checks',
    '/amina/compliance',
    '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger',
  ],
  compliance_officer: [
    '/amina',
    '/amina/providers', '/amina/wallet-controllers', '/amina/transfer-checks',
    '/amina/compliance', '/amina/audit-log', '/amina/transparency',
    '/amina/architecture', '/amina/translation-pipeline', '/amina/finstar-ledger',
  ],
  emergency_admin: [
    '/amina',
    '/amina/emergency', '/amina/operations',
    '/amina/compliance',
    '/amina/architecture',
  ],
  client_representative: [],
};

const roleBadgeColor: Record<Role, string> = {
  admin: 'bg-teal-100 text-teal-700 border-teal-300/40',
  portfolio_manager: 'bg-success-100 text-success-700 border-success-700/20',
  compliance_officer: 'bg-warning-100 text-warning-700 border-warning-700/20',
  emergency_admin: 'bg-error-100 text-error-700 border-error-700/20',
  client_representative: 'bg-review-100 text-review-700 border-review-700/20',
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const { currentRole, activeVaultId, adminUser, notification, clearNotification, setRole, logout, setDemoMode } = useStore();

  const accessiblePaths = roleAccess[currentRole] || [];

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => accessiblePaths.includes(item.path)),
    }))
    .filter((section) => section.items.length > 0);

  const location = useLocation();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as Role;
    setRole(newRole);
    const newAccess = roleAccess[newRole] || [];
    const currentPath = location.pathname;
    if (currentPath !== '/amina' && !newAccess.includes(currentPath)) {
      navigate('/amina');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-amina-ops-bg text-ink-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200">
          <h1 className="text-xl font-bold tracking-wide text-teal-800">AMINA</h1>
          <p className="text-xs text-slate-500 mt-0.5">Administration Console</p>
          <div className="flex gap-2 mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-300/40 font-medium">
              Segregated
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-review-100 text-review-700 border border-review-700/20 font-medium">
              Permissioned
            </span>
          </div>
        </div>

        {/* Current User Card */}
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Signed In As</p>
          {adminUser && (
            <p className="text-sm font-medium text-ink-900 mb-1">{adminUser.name}</p>
          )}
          {adminUser && (
            <p className="text-[11px] text-slate-500 mb-1.5">{adminUser.email}</p>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${roleBadgeColor[currentRole]}`}>
              {ROLE_LABELS[currentRole]}
            </span>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="px-4 py-3 border-b border-slate-200">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1.5">
            Switch Role (Demo)
          </label>
          <div className="relative">
            <select
              value={currentRole}
              onChange={handleRoleChange}
              className="w-full bg-white border border-slate-200 rounded-md text-xs text-ink-900 py-1.5 px-2 pr-7 appearance-none focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 cursor-pointer transition-colors"
            >
              {AMINA_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {visibleSections.map((section) => (
            <div key={section.section}>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium px-3 mb-1.5">
                {section.section}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-[12px] text-sm font-medium transition-all ease-amina duration-150 ${
                        isActive
                          ? 'bg-teal-100 text-teal-800 border-l-2 border-teal-600'
                          : 'text-slate-600 hover:text-ink-900 hover:bg-slate-100 border-l-2 border-transparent'
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Pitch Mode + Logout */}
        <div className="px-4 py-3 border-t border-slate-200 space-y-1">
          <button
            onClick={() => setDemoMode(true)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-[12px] text-sm text-teal-700 hover:text-teal-800 hover:bg-teal-50 transition-all ease-amina duration-150 font-medium"
          >
            <Presentation className="w-4 h-4" />
            Pitch Mode
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-[12px] text-sm text-slate-500 hover:text-error-700 hover:bg-error-100 transition-all ease-amina duration-150"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-400 text-center">Solana Devnet | Hackathon Demo v1.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-amina-ops-bg">
        <Outlet />
      </main>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-[12px] shadow-2 border text-sm font-medium transition-all ease-amina duration-240 ${
            notification.type === 'success'
              ? 'bg-success-100 border-success-700/20 text-success-700'
              : notification.type === 'error'
              ? 'bg-error-100 border-error-700/20 text-error-700'
              : 'bg-info-100 border-info-700/20 text-info-700'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={clearNotification}
            className="text-slate-400 hover:text-ink-900 ml-2"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
