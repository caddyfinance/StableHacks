import { useStore } from '../store/useStore';

const API_BASE = (import.meta as any).env?.VITE_API_URL
  ? `${(import.meta as any).env.VITE_API_URL.replace(/\/+$/, '')}/api`
  : '/api';

function getCurrentRole(): string {
  return useStore.getState().currentRole;
}

function getCurrentWallet(): string | undefined {
  return useStore.getState().clientInfo?.walletAddress;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const role = getCurrentRole();
  const wallet = getCurrentWallet();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-role': role,
  };
  if (wallet) headers['x-wallet'] = wallet;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });
  const data = await res.json();
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  return data;
}

export const api = {
  // Admin Auth (Legacy)
  adminLogin: (email: string, password: string) => request<any>('/admin-auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getAdminUsers: () => request<any[]>('/admin-auth/users'),

  // Admin Auth (Entra ID)
  getEntraUsers: () => request<any[]>('/admin-auth/entra/users'),
  initiateEntraLogin: (email: string) => request<any>('/admin-auth/entra/login', { method: 'POST', body: JSON.stringify({ email }) }),
  validateEntraCallback: (code: string) => request<any>('/admin-auth/entra/callback', { method: 'POST', body: JSON.stringify({ code }) }),

  // On-Chain Verification
  verifyOnChain: (walletAddress: string) => request<any>(`/credentials/verify-onchain/${walletAddress}`),

  // Credentials
  getCredentials: () => request<any[]>('/credentials'),
  issueCredential: (data: any) => request<any>('/credentials', { method: 'POST', body: JSON.stringify(data) }),
  revokeCredential: (id: string) => request<any>(`/credentials/${id}/revoke`, { method: 'PUT' }),
  lookupWallet: (address: string) => request<any>(`/credentials/wallet/${address}`),
  lookupByReference: (ref: string) => request<any>(`/credentials/lookup/${ref}`),
  bindWallet: (credentialId: string, walletAddress: string) => request<any>('/credentials/bind-wallet', { method: 'PUT', body: JSON.stringify({ credentialId, walletAddress }) }),

  // Vaults
  getTransparency: () => request<any>('/vaults/transparency'),
  getVaults: () => request<any[]>('/vaults'),
  getVaultsByWallet: (wallet: string) => request<any[]>(`/vaults/by-wallet/${wallet}`),
  createVault: (data: any) => request<any>('/vaults', { method: 'POST', body: JSON.stringify(data) }),
  getSnapshot: (id: string) => request<any>(`/vaults/${id}/snapshot`),
  attachMandate:      (id: string, data: any) => request<any>(`/vaults/${id}/mandate`, { method: 'POST', body: JSON.stringify(data) }),
  updateMandate:      (id: string, data: any) => request<any>(`/vaults/${id}/mandate`, { method: 'PUT', body: JSON.stringify(data) }),
  getMandate:         (id: string) => request<any>(`/vaults/${id}/mandate`),
  getMandateRules:    (id: string) => request<any[]>(`/vaults/${id}/mandate/rules`),
  getMandateHistory:  (id: string) => request<any[]>(`/vaults/${id}/mandate/history`),
  getBufferHealth:    (id: string) => request<any>(`/vaults/${id}/buffer-health`),
  syncMandateToChain: (id: string) => request<any>(`/vaults/${id}/mandate/sync`, { method: 'POST' }),
  activateVault: (id: string, opts?: { signature?: string; signerWallet?: string }) =>
    request<any>(`/vaults/${id}/activate`, { method: 'POST', body: JSON.stringify(opts || {}) }),
  getAminaWallet: () => request<{ wallet: string }>('/vaults/amina-wallet'),
  getAminaBankBalance: () => request<{ balance: number; currency: string }>('/vaults/amina-bank-balance'),
  onramp: (recipientWallet: string, amount: number) => request<any>('/vaults/onramp', { method: 'POST', body: JSON.stringify({ recipientWallet, amount }) }),
  offramp: (senderWallet: string, amount: number, txSignature?: string) => request<any>('/vaults/offramp', { method: 'POST', body: JSON.stringify({ senderWallet, amount, txSignature }) }),
  getDeposits: (id: string) => request<any[]>(`/vaults/${id}/deposits`),
  deposit: (id: string, data: any) => request<any>(`/vaults/${id}/deposit`, { method: 'POST', body: JSON.stringify(data) }),
  allocate: (id: string, data: any) => request<any>(`/vaults/${id}/allocate`, { method: 'POST', body: JSON.stringify(data) }),
  redeem: (id: string, data: any) => request<any>(`/vaults/${id}/redeem`, { method: 'POST', body: JSON.stringify(data) }),
  unwind: (id: string, data: any) => request<any>(`/vaults/${id}/unwind`, { method: 'POST', body: JSON.stringify(data) }),
  togglePause: (id: string) => request<any>(`/vaults/${id}/pause`, { method: 'POST' }),
  accrueYield: (id: string) => request<any>(`/vaults/${id}/accrue-yield`, { method: 'POST' }),

  // Strategies
  getStrategies: () => request<any[]>('/strategies'),
  toggleStrategy: (id: string, disabled: boolean) => request<any>(`/strategies/${id}/disable`, { method: 'PUT', body: JSON.stringify({ disabled }) }),

  // Consent
  getConsentRequests: () => request<any[]>('/consent'),
  approveConsent: (id: string) => request<any>(`/consent/${id}/approve`, { method: 'PUT' }),

  // Solstice Yield Protocol
  solsticeLock: (vaultId: string, amount: number, collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/lock', { method: 'POST', body: JSON.stringify({ vaultId, amount, collateral }) }),
  solsticeUnlock: (vaultId: string, amount: number) => request<any>('/solstice/unlock', { method: 'POST', body: JSON.stringify({ vaultId, amount }) }),
  solsticeWithdraw: (vaultId: string) => request<any>('/solstice/withdraw', { method: 'POST', body: JSON.stringify({ vaultId }) }),
  solsticePoolState: () => request<any>('/solstice/pool-state'),
  solsticePosition: (vaultId: string) => request<any>(`/solstice/position/${vaultId}`),
  solsticeFundFlow: (vaultId: string) => request<any[]>(`/solstice/fund-flow/${vaultId}`),

  // USX Minting & Redemption
  solsticeRequestMint: (amount: number, collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/request-mint', { method: 'POST', body: JSON.stringify({ amount, collateral }) }),
  solsticeConfirmMint: (collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/confirm-mint', { method: 'POST', body: JSON.stringify({ collateral }) }),
  solsticeCancelMint: (collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/cancel-mint', { method: 'POST', body: JSON.stringify({ collateral }) }),
  solsticeRequestRedeem: (amount: number, collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/request-redeem', { method: 'POST', body: JSON.stringify({ amount, collateral }) }),
  solsticeConfirmRedeem: (collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/confirm-redeem', { method: 'POST', body: JSON.stringify({ collateral }) }),
  solsticeCancelRedeem: (collateral: 'usdc' | 'usdt' = 'usdc') => request<any>('/solstice/cancel-redeem', { method: 'POST', body: JSON.stringify({ collateral }) }),

  // Events
  getEvents: (vaultId?: string, actionType?: string) => {
    const params = new URLSearchParams();
    if (vaultId) params.set('vaultId', vaultId);
    if (actionType) params.set('actionType', actionType);
    return request<any[]>(`/events?${params.toString()}`);
  },

  // Translation Layer (Layer 2)
  tlSubmitInstruction: (data: { instructionType: string; vaultId: string; amount: number; jurisdiction: string; strategyId: string }) =>
    request<any>('/translation-layer/submit', { method: 'POST', body: JSON.stringify(data) }),
  tlExecuteCompliance: (id: string) =>
    request<any>(`/translation-layer/${id}/compliance`, { method: 'POST' }),
  tlExecuteAction: (id: string) =>
    request<any>(`/translation-layer/${id}/action`, { method: 'POST' }),
  tlGetPipelineStatus: (id: string) =>
    request<any>(`/translation-layer/${id}/status`),
  tlGetHistory: (vaultId: string) =>
    request<any[]>(`/translation-layer/history/${vaultId}`),
  tlGetConfig: () =>
    request<any>('/translation-layer/config'),

  // Finstar (Layer 1 — Core Banking)
  finstarGetConfig: () =>
    request<any>('/finstar/config'),
  finstarGetLedger: (vaultId: string) =>
    request<any>(`/finstar/ledger/${vaultId}`),
  finstarGetEntry: (entryId: string) =>
    request<any>(`/finstar/entries/${entryId}`),
  finstarGetReports: (vaultId: string) =>
    request<any[]>(`/finstar/reports/${vaultId}`),

  // Compliance Layer (Notabene, Mesh, Jurisdiction Engine)
  complianceGetTravelRuleCheck: (checkId: string) =>
    request<any>(`/compliance/travel-rule/${checkId}`),
  complianceGetTravelRuleChecks: (vaultId?: string) => {
    const params = vaultId ? `?vaultId=${vaultId}` : '';
    return request<any[]>(`/compliance/travel-rule${params}`);
  },
  complianceGetVASPs: () =>
    request<any[]>('/compliance/vasps'),
  complianceGetVenues: () =>
    request<any[]>('/compliance/venues'),
  complianceGetRouting: (vaultId: string) =>
    request<any[]>(`/compliance/routing/${vaultId}`),
  complianceGetJurisdictions: () =>
    request<any[]>('/compliance/jurisdictions'),
  complianceGetJurisdiction: (code: string) =>
    request<any>(`/compliance/jurisdictions/${code}`),
  complianceGetAttestations: (vaultId: string) =>
    request<any[]>(`/compliance/attestations/${vaultId}`),
};
