import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import { RefreshCw, ExternalLink } from 'lucide-react';

const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEVNET_RPC = (import.meta as any).env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const fmt = (v: number) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface VaultRow {
  vaultId: string;
  status: string;
  baseAsset: string;
  idleBalance: number;
  totalDeposited: number;
  totalNAV: number;
  onChainAddress?: string;
  allocations?: { amount: number; yieldAccrued: number; status: string; strategy: { name: string } }[];
}

export default function VaultOverviewPage() {
  const { activeVaultId, setActiveVaultId, clientInfo } = useStore();
  const { publicKey } = useWallet();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const walletAddress = publicKey?.toBase58() || clientInfo?.walletAddress || '';

  const loadData = async () => {
    setLoading(true);
    try {
      const wallet = clientInfo?.walletAddress;
      const vaultData = wallet ? await api.getVaultsByWallet(wallet) : await api.getVaults();
      setVaults(vaultData);
      if (!activeVaultId && vaultData.length > 0) setActiveVaultId(vaultData[0].vaultId);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!walletAddress) return;
    const conn = new Connection(DEVNET_RPC, 'confirmed');
    const pk = new PublicKey(walletAddress);
    conn.getParsedTokenAccountsByOwner(pk, { mint: new PublicKey(USDC_MINT_DEVNET) })
      .then(r => setUsdcBalance(r.value.length > 0 ? r.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0 : 0))
      .catch(() => setUsdcBalance(0));
  }, [walletAddress]);

  const totalIdle = vaults.reduce((s, v) => s + (v.idleBalance || 0), 0);
  const totalDeposited = vaults.reduce((s, v) => s + (v.totalDeposited || 0), 0);
  const totalNAV = vaults.reduce((s, v) => s + (v.totalNAV || 0), 0);
  const totalDeployed = totalNAV - totalIdle;
  const totalYield = vaults.reduce((s, v) => {
    const allocs = v.allocations?.filter(a => a.status === 'active') || [];
    return s + allocs.reduce((ss, a) => ss + (a.yieldAccrued || 0), 0);
  }, 0);

  const vaultRows = vaults.map(v => {
    const activeAllocs = v.allocations?.filter(a => a.status === 'active') || [];
    const deployed = activeAllocs.reduce((s, a) => s + (a.amount || 0), 0);
    const yieldAmt = activeAllocs.reduce((s, a) => s + (a.yieldAccrued || 0), 0);
    const allocPct = totalNAV > 0 ? Math.round(((v.totalNAV || 0) / totalNAV) * 100) : 0;
    const strategies = activeAllocs.map(a => a.strategy?.name).filter(Boolean);
    return { ...v, deployed, yieldAmt, allocPct, strategies };
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Portfolio Overview</h1>
          <p className="text-xs text-vault-muted mt-1">Your stablecoin balances and vault performance</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Top Cards — 4 key metrics + wallet balance merged */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Total Balance</p>
          <p className="text-xl font-bold font-mono text-white">{fmt((usdcBalance || 0) + totalNAV)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">
            {usdcBalance !== null ? fmt(usdcBalance) : '0.00'} wallet + {fmt(totalNAV)} in vaults
          </p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Wallet Balance</p>
          <p className="text-xl font-bold font-mono text-yellow-400">{usdcBalance !== null ? fmt(usdcBalance) : '—'}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">
            USDC in wallet
            {walletAddress && (
              <a href={`https://solscan.io/account/${walletAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                className="ml-1.5 text-vault-accent hover:underline inline-flex items-center gap-0.5">
                Explorer <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">In Vaults</p>
          <p className="text-xl font-bold font-mono text-vault-accent">{fmt(totalNAV)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">USDC across all vaults</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Yield Earned</p>
          <p className="text-xl font-bold font-mono text-green-400">+{fmt(totalYield)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">Accrued returns</p>
        </div>
      </div>


      {/* Vault Allocations */}
      {!loading && vaultRows.length > 0 && (
        <Card title="Vault Allocations" subtitle={`${vaultRows.length} segregated vault${vaultRows.length !== 1 ? 's' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-vault-muted">
                  <th className="text-left py-2.5 pr-4 font-semibold border-b border-vault-border">Vault</th>
                  <th className="text-right py-2.5 pr-4 font-semibold border-b border-vault-border">Deployed</th>
                  <th className="text-right py-2.5 pr-4 font-semibold border-b border-vault-border">Yield</th>
                  <th className="text-right py-2.5 font-semibold border-b border-vault-border">On-Chain</th>
                </tr>
              </thead>
              <tbody>
                {vaultRows.map((v, i) => (
                  <tr key={v.vaultId} className={`hover:bg-white/[0.015] transition-colors ${i < vaultRows.length - 1 ? 'border-b border-vault-border/30' : ''}`}>
                    <td className="py-3 pr-4 font-mono font-semibold text-white">{v.vaultId}</td>
                    <td className="py-3 pr-4 text-right font-mono text-white">{fmt(v.deployed)}</td>
                    <td className="py-3 pr-4 text-right font-mono text-green-400">{v.yieldAmt > 0 ? `+${fmt(v.yieldAmt)}` : '—'}</td>
                    <td className="py-3 text-right">
                      {v.onChainAddress ? (
                        <a href={`https://solscan.io/account/${v.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-vault-accent hover:underline">
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-vault-muted animate-pulse text-center py-8">Loading portfolio...</p>}
      {!loading && vaults.length === 0 && (
        <p className="text-sm text-vault-muted text-center py-8">No vaults found. Vaults are created by Amina Bank for your account.</p>
      )}
    </div>
  );
}
