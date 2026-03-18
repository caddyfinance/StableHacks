import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UserCheck,
  Wallet,
  ClipboardCheck,
  LogOut,
  ShieldCheck,
  Vault,
  ArrowLeftRight,
} from 'lucide-react';
import { useStore } from '../store/useStore';

const navItems = [
  { path: '/client', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/client/ramp', label: 'On/Off Ramp', icon: ArrowLeftRight, end: false },
  { path: '/client/vaults', label: 'My Vaults', icon: Vault, end: false },
  { path: '/client/request-credential', label: 'Credential Access', icon: ShieldCheck, end: false },
  { path: '/client/consent', label: 'Consent Requests', icon: UserCheck, end: false },
  { path: '/client/activity', label: 'Activity Log', icon: ClipboardCheck, end: false },
];

export default function ClientLayout() {
  const navigate = useNavigate();
  const { activeVaultId, clientInfo, notification, clearNotification, logout } = useStore();

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
          <p className="text-xs text-gray-400 mt-0.5">Client Portal</p>
          <div className="mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
              Institutional Client
            </span>
          </div>
        </div>

        {/* Client Info Card */}
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Client Profile</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Client ID</span>
              <span className="text-xs text-gray-200 font-mono font-medium">{clientInfo?.clientReference || 'INST-2048'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Credential</span>
              <span className="text-xs text-gray-200 font-mono font-medium">{clientInfo?.credentialId || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Jurisdiction</span>
              <span className="text-xs text-gray-200 font-medium">{clientInfo?.jurisdiction || 'Switzerland'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Risk Profile</span>
              <span className="text-xs text-amber-400 font-medium">{clientInfo?.riskTier || 'Conservative'}</span>
            </div>
            {clientInfo?.walletAddress && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Wallet</span>
                <span className="text-xs text-gray-200 font-mono font-medium">
                  {clientInfo.walletAddress.length > 16
                    ? `${clientInfo.walletAddress.slice(0, 6)}...${clientInfo.walletAddress.slice(-6)}`
                    : clientInfo.walletAddress}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
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
          <p className="text-[10px] text-gray-600 text-center">Solana Devnet | Client View</p>
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
