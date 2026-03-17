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
} from 'lucide-react';
import { useStore, Role, ROLE_LABELS, AMINA_ROLES, Portal } from '../store/useStore';

const navItems = [
  { path: '/amina', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/amina/credentials', label: 'Credentials', icon: Shield, end: false },
  { path: '/amina/vault-factory', label: 'Vault Factory', icon: Building2, end: false },
  { path: '/amina/mandate', label: 'Mandate Config', icon: FileCheck, end: false },
  { path: '/amina/funding', label: 'Vault Funding', icon: Wallet, end: false },
  { path: '/amina/execution', label: 'Execution', icon: TrendingUp, end: false },
  { path: '/amina/compliance', label: 'Compliance', icon: ClipboardCheck, end: false },
  { path: '/amina/emergency', label: 'Emergency Controls', icon: AlertTriangle, end: false },
];

const roleAccess: Record<Role, string[]> = {
  admin: ['/amina', '/amina/credentials', '/amina/vault-factory', '/amina/mandate', '/amina/funding', '/amina/compliance'],
  portfolio_manager: ['/amina', '/amina/execution', '/amina/compliance'],
  compliance_officer: ['/amina', '/amina/compliance'],
  emergency_admin: ['/amina', '/amina/emergency', '/amina/compliance'],
  client_representative: [],
};

const roleBadgeColor: Record<Role, string> = {
  admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  portfolio_manager: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  compliance_officer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  emergency_admin: 'bg-red-500/20 text-red-400 border-red-500/30',
  client_representative: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const { currentRole, activeVaultId, adminUser, notification, clearNotification, setRole, logout } = useStore();

  const accessiblePaths = roleAccess[currentRole] || [];
  const visibleNavItems = navItems.filter((item) => accessiblePaths.includes(item.path));

  const location = useLocation();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as Role;
    setRole(newRole);

    // If current page is not accessible by the new role, redirect to dashboard
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
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-wide text-white">AMINA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Administration Console</p>
          <div className="flex gap-2 mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
              Segregated
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
              Permissioned
            </span>
          </div>
        </div>

        {/* Current User Card */}
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Signed In As</p>
          {adminUser && (
            <p className="text-sm font-medium text-white mb-1">{adminUser.name}</p>
          )}
          {adminUser && (
            <p className="text-[11px] text-gray-500 mb-1.5">{adminUser.email}</p>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${roleBadgeColor[currentRole]}`}>
              {ROLE_LABELS[currentRole]}
            </span>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="px-4 py-3 border-b border-gray-800">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1.5">
            Switch Role (Demo)
          </label>
          <div className="relative">
            <select
              value={currentRole}
              onChange={handleRoleChange}
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-200 py-1.5 px-2 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            >
              {AMINA_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 py-3 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-600 text-center">Solana Devnet | Hackathon Demo v1.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-950">
        <Outlet />
      </main>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : notification.type === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={clearNotification}
            className="text-gray-500 hover:text-gray-300 ml-2"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
