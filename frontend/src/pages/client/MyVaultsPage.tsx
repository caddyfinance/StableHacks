import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import { Vault, ExternalLink, RefreshCw, ChevronRight } from 'lucide-react';

interface VaultData {
  vaultId: string;
  credentialId: string;
  clientReference: string;
  ownerWallet: string;
  baseAsset: string;
  status: string;
  paused: boolean;
  idleBalance: number;
  totalDeposited: number;
  totalNAV: number;
  onChainAddress?: string;
  vaultAttestationPda?: string;
  createdAt: string;
  allocations?: { amount: number; yieldAccrued: number; status: string; strategy: { name: string } }[];
}

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const truncate = (s: string, len = 16) => s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-6)}` : s;

export default function MyVaultsPage() {
  const { notify, clientInfo, setActiveVaultId, activeVaultId } = useStore();
  const navigate = useNavigate();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'nav-desc' | 'nav-asc' | 'yield-desc' | 'idle-desc' | 'newest' | 'oldest'>('nav-desc');

  const loadVaults = async () => {
    setLoading(true);
    try {
      const wallet = clientInfo?.walletAddress;
      const data = wallet ? await api.getVaultsByWallet(wallet) : await api.getVaults();
      setVaults(data);
      if (!activeVaultId && data.length > 0) setActiveVaultId(data[0].vaultId);
    } catch {
      notify('error', 'Failed to load vaults');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVaults(); }, []);

  const totalNAV = vaults.reduce((s, v) => s + (v.totalNAV || 0), 0);
  const totalYield = vaults.reduce((s, v) => {
    const allocs = v.allocations?.filter(a => a.status === 'active') || [];
    return s + allocs.reduce((ss, a) => ss + (a.yieldAccrued || 0), 0);
  }, 0);
  const activeCount = vaults.filter(v => v.status === 'active').length;

  const sortedVaults = [...vaults].sort((a, b) => {
    const aYield = (a.allocations?.filter(x => x.status === 'active') || []).reduce((s, x) => s + (x.yieldAccrued || 0), 0);
    const bYield = (b.allocations?.filter(x => x.status === 'active') || []).reduce((s, x) => s + (x.yieldAccrued || 0), 0);
    switch (sortBy) {
      case 'nav-desc': return (b.totalNAV || 0) - (a.totalNAV || 0);
      case 'nav-asc': return (a.totalNAV || 0) - (b.totalNAV || 0);
      case 'yield-desc': return bYield - aYield;
      case 'idle-desc': return (b.idleBalance || 0) - (a.idleBalance || 0);
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      default: return 0;
    }
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Vault className="w-5 h-5 text-vault-accent" />
            My Vaults
          </h1>
          <p className="text-xs text-vault-muted mt-1">Your segregated vaults deployed by Amina Bank</p>
        </div>
        <button onClick={loadVaults} className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">In Vaults</p>
          <p className="text-xl font-bold font-mono text-vault-accent">{fmt(totalNAV)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">USDC across all vaults</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Deployed</p>
          <p className="text-xl font-bold font-mono text-white">{fmt(totalNAV)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">{vaults.length} vault{vaults.length !== 1 ? 's' : ''}, {activeCount} active</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Yield Earned</p>
          <p className="text-xl font-bold font-mono text-green-400">+{fmt(totalYield)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">Accrued returns</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Active Vaults</p>
          <p className="text-xl font-bold font-mono text-white">{activeCount} <span className="text-vault-muted text-sm font-normal">/ {vaults.length}</span></p>
          <p className="text-[10px] text-vault-muted mt-0.5">Segregated vaults</p>
        </div>
      </div>

      {/* Vault List Header + Sort */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Your Segregated Vaults</h3>
          <p className="text-[10px] text-vault-muted">{loading ? 'Loading...' : `${vaults.length} vault(s)`}</p>
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-1.5 rounded bg-vault-bg border border-vault-border text-white text-xs focus:outline-none focus:border-vault-accent transition-colors">
          <option value="nav-desc">Highest Capital</option>
          <option value="nav-asc">Lowest Capital</option>
          <option value="yield-desc">Best Yield</option>
          <option value="idle-desc">Most Idle</option>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {/* Vault Cards */}
      {loading ? (
        <p className="text-sm text-vault-muted animate-pulse py-4">Loading vaults...</p>
      ) : vaults.length === 0 ? (
        <p className="text-sm text-vault-muted text-center py-8">No vaults found for your wallet.</p>
      ) : (
        <div className="space-y-3">
          {sortedVaults.map(v => {
            const deployed = (v.totalNAV || 0) - (v.idleBalance || 0);
            const activeAllocs = v.allocations?.filter(a => a.status === 'active') || [];
            const yieldTotal = activeAllocs.reduce((s, a) => s + (a.yieldAccrued || 0), 0);

            return (
              <div key={v.vaultId}
                onClick={() => {
                  setActiveVaultId(v.vaultId);
                  navigate(`/client/vaults/${v.vaultId}`);
                }}
                className="bg-vault-bg border border-vault-border rounded-lg p-4 hover:border-vault-accent/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  {/* Left: vault info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-[70px]">
                      <span className="text-sm font-mono font-bold text-white">{v.vaultId}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <StatusBadge status={v.status} />
                        {v.paused && <span className="text-[9px] px-1 py-0.5 bg-red-900/30 text-red-400 rounded font-semibold">PAUSED</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-vault-muted">NAV</p>
                        <p className="font-mono font-semibold text-white">{fmt(v.totalNAV || 0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-vault-muted">Deployed</p>
                        <p className="font-mono text-vault-muted">{fmt(deployed > 0 ? deployed : 0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-vault-muted">Yield</p>
                        <p className="font-mono text-green-400">{yieldTotal > 0 ? `+${fmt(yieldTotal)}` : '—'}</p>
                      </div>
                      {activeAllocs.length > 0 && (
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-vault-muted">Strategies</p>
                          <p className="text-vault-muted">{activeAllocs.map(a => a.strategy?.name).join(', ')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: explorer icon + view vault */}
                  <div className="flex items-center gap-3 ml-4">
                    {v.onChainAddress && (
                      <a href={`https://solscan.io/account/${v.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-vault-muted hover:text-vault-accent transition-colors" title="View on Solana Explorer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <span className="text-xs text-vault-accent font-medium group-hover:text-white transition-colors flex items-center gap-1">
                      View Vault <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
