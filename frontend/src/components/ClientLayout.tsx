import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UserCheck,
  Wallet,
  ClipboardCheck,
  LogOut,
  ShieldCheck,
  Vault,
  ArrowLeftRight,
  FileCheck,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';

const navItems = [
  { path: '/client', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/client/ramp', label: 'On/Off Ramp', icon: ArrowLeftRight, end: false },
  { path: '/client/vaults', label: 'My Vaults', icon: Vault, end: false },
  { path: '/client/request-credential', label: 'Credential Access', icon: ShieldCheck, end: false },
  { path: '/client/mandate', label: 'Mandate Policy', icon: FileCheck, end: false },
  { path: '/client/consent', label: 'Consent Requests', icon: UserCheck, end: false },
  { path: '/client/activity', label: 'Activity Log', icon: ClipboardCheck, end: false },
];

export default function ClientLayout() {
  const navigate = useNavigate();
  const { activeVaultId, clientInfo, notification, clearNotification, logout, setClientInfo, setActiveVaultId, setCredentialRevoked } = useStore();
  const checkedRef = useRef(false);

  // Check credential validity on mount — if SAS is revoked, strip credential access
  useEffect(() => {
    if (checkedRef.current || !clientInfo?.walletAddress || !clientInfo?.credentialId) return;
    checkedRef.current = true;

    const checkCredentialStatus = async () => {
      try {
        const result = await api.lookupWallet(clientInfo.walletAddress);
        if (!result.authenticated) {
          // Credential revoked or no longer active — keep wallet but clear credential
          setClientInfo({ walletAddress: clientInfo.walletAddress });
          setActiveVaultId(null);
          setCredentialRevoked(true);
        }
      } catch {
        // Network error — don't revoke on transient failures
      }
    };
    checkCredentialStatus();
  }, [clientInfo?.walletAddress]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Auto-logout if no wallet connected (session expired or demo wallet cleared)
  if (!clientInfo?.walletAddress) {
    logout();
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen bg-amina-client-bg text-ink-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-1">
        {/* Header */}
        <div className="p-5 border-b border-slate-200">
          <h1 className="text-xl font-display font-bold tracking-wide text-teal-800">AMINA</h1>
          <p className="text-xs text-slate-500 mt-0.5">Client Portal</p>
          <div className="mt-3">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-100 text-gold-500 border border-gold-500/30 font-medium">
              Institutional Client
            </span>
          </div>
        </div>

        {/* Client Info Card */}
        <div className="px-4 py-3 border-b border-slate-200">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Client Profile</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Client ID</span>
              <span className="text-xs text-ink-900 font-mono font-medium">{clientInfo?.clientReference || 'INST-2048'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Credential</span>
              <span className="text-xs text-ink-900 font-mono font-medium">{clientInfo?.credentialId || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Jurisdiction</span>
              <span className="text-xs text-ink-900 font-medium">{clientInfo?.jurisdiction || 'Switzerland'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Risk Profile</span>
              <span className="text-xs text-warning-700 font-medium">{clientInfo?.riskTier || 'Conservative'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Segment</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-300/40 font-medium">Individual</span>
            </div>
            {clientInfo?.walletAddress && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Wallet</span>
                <span className="text-xs text-ink-900 font-mono font-medium">
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
                `flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-sm font-medium transition-all ease-amina duration-150 ${
                  isActive
                    ? 'bg-teal-100 text-teal-800'
                    : 'text-slate-600 hover:text-ink-900 hover:bg-slate-100'
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 py-3 border-t border-slate-200">
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
          <p className="text-[10px] text-slate-400 text-center">Solana Devnet | Client View</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-amina-client-bg">
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
