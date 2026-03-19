import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'admin' | 'portfolio_manager' | 'compliance_officer' | 'client_representative' | 'emergency_admin';
export type Portal = 'client' | 'amina';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Bank Admin',
  portfolio_manager: 'Portfolio Manager',
  compliance_officer: 'Compliance Officer',
  client_representative: 'Client Representative',
  emergency_admin: 'Emergency Admin',
};

export const AMINA_ROLES: Role[] = ['admin', 'portfolio_manager', 'compliance_officer', 'emergency_admin'];
export const CLIENT_ROLES: Role[] = ['client_representative'];

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ClientInfo {
  walletAddress: string;
  credentialId?: string;
  clientReference?: string;
  jurisdiction?: string;
  riskTier?: string;
}

interface AppState {
  isAuthenticated: boolean;
  currentRole: Role;
  portal: Portal | null;
  activeVaultId: string | null;
  adminUser: AdminUser | null;
  clientInfo: ClientInfo | null;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;

  loginAdmin: (user: AdminUser) => void;
  loginClient: (info: ClientInfo, vaultId: string | null) => void;
  login: (portal: Portal, role: Role) => void;
  setClientInfo: (info: ClientInfo) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  setActiveVaultId: (id: string | null) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
  clearNotification: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentRole: 'admin',
      portal: null,
      activeVaultId: null,
      adminUser: null,
      clientInfo: null,
      notification: null,

      loginAdmin: (user) => set({
        isAuthenticated: true,
        portal: 'amina',
        currentRole: user.role as Role,
        adminUser: user,
      }),
      login: (portal, role) => set({ isAuthenticated: true, portal, currentRole: role }),
      setClientInfo: (info) => set({ clientInfo: info }),
      loginClient: (info, vaultId) => set({
        isAuthenticated: true,
        portal: 'client',
        currentRole: 'client_representative',
        clientInfo: info,
        activeVaultId: vaultId,
      }),
      logout: () => set({
        isAuthenticated: false, portal: null, currentRole: 'admin',
        activeVaultId: null, clientInfo: null, adminUser: null,
      }),
      setRole: (role) => {
        const rolePersonas: Record<Role, { id: string; email: string; name: string }> = {
          admin: { id: 'admin-1', email: 'admin@amina.bank', name: 'Sarah Chen' },
          portfolio_manager: { id: 'pm-1', email: 'pm@amina.bank', name: 'Marcus Weber' },
          compliance_officer: { id: 'co-1', email: 'compliance@amina.bank', name: 'Elena Rossi' },
          emergency_admin: { id: 'ea-1', email: 'emergency@amina.bank', name: 'James Park' },
          client_representative: { id: 'cr-1', email: 'client@amina.bank', name: 'Client User' },
        };
        const persona = rolePersonas[role];
        set({ currentRole: role, adminUser: { ...persona, role } });
      },
      setActiveVaultId: (id) => set({ activeVaultId: id }),
      notify: (type, message) => {
        set({ notification: { type, message } });
        setTimeout(() => set({ notification: null }), 4000);
      },
      clearNotification: () => set({ notification: null }),
    }),
    {
      name: 'amina-session',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        currentRole: state.currentRole,
        portal: state.portal,
        activeVaultId: state.activeVaultId,
        adminUser: state.adminUser,
        clientInfo: state.clientInfo,
      }) as unknown as AppState,
    },
  ),
);
