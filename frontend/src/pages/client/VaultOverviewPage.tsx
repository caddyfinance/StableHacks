import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import { RefreshCw, TrendingUp, Wallet, BarChart3, PiggyBank, ExternalLink } from 'lucide-react';

const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEVNET_RPC = (import.meta as any).env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Dummy multi-vault portfolio data
const VAULT_ROWS = [
  { vault: 'VLT-001', strategy: 'Conservative Yield', mandate: '60/40 Stbl/Trsy', allocated: 600000, idle: 250000, nav: 871200, allocPct: 42, status: 'active', returnAmt: 21200, returnPct: 2.5, yieldApy: 4.2 },
  { vault: 'VLT-002', strategy: 'Treasury Only', mandate: '100% Treasury', allocated: 500000, idle: 120000, nav: 631800, allocPct: 34, status: 'active', returnAmt: 11800, returnPct: 1.9, yieldApy: 3.8 },
  { vault: 'VLT-003', strategy: 'Balanced Growth', mandate: '50/50 Stbl/Trsy', allocated: 330000, idle: 50000, nav: 395600, allocPct: 21, status: 'active', returnAmt: 15600, returnPct: 4.1, yieldApy: 5.1 },
];

const RECENT_ACTIVITY = [
  { time: 'Mar 17, 14:30', activity: 'Capital Deployed', vault: 'VLT-003', asset: 'USDC', amount: 150000, status: 'Completed' },
  { time: 'Mar 16, 14:22', activity: 'Redemption Executed', vault: 'VLT-001', asset: 'USDC', amount: 250000, status: 'Completed' },
  { time: 'Mar 16, 10:05', activity: 'Consent Approved', vault: 'VLT-002', asset: 'USDC', amount: 300000, status: 'Completed' },
  { time: 'Mar 15, 11:26', activity: 'Vault Funded', vault: 'VLT-002', asset: 'USDC', amount: 1500000, status: 'Completed' },
  { time: 'Mar 15, 09:15', activity: 'Vault Funded', vault: 'VLT-001', asset: 'USDC', amount: 1000000, status: 'Completed' },
];

const fmt = (v: number) => {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function VaultOverviewPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();
  const { publicKey } = useWallet();

  if (!clientInfo?.credentialId) {
    return <NotVerified />;
  }

  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const walletAddress = publicKey?.toBase58() || clientInfo?.walletAddress || '';

  useEffect(() => {
    if (!activeVaultId) {
      api.getVaults().then((v) => { if (v.length > 0) setActiveVaultId(v[0].vaultId); }).catch(() => {});
    }
  }, [activeVaultId, setActiveVaultId]);

  useEffect(() => {
    if (activeVaultId) {
      setLoading(true);
      api.getSnapshot(activeVaultId).then(setSnapshot).catch(() => {}).finally(() => setLoading(false));
    }
  }, [activeVaultId]);

  useEffect(() => {
    if (!walletAddress) return;
    const conn = new Connection(DEVNET_RPC, 'confirmed');
    const pk = new PublicKey(walletAddress);
    conn.getBalance(pk).then(l => setSolBalance(l / 1e9)).catch(() => {});
    conn.getParsedTokenAccountsByOwner(pk, { mint: new PublicKey(USDC_MINT_DEVNET) })
      .then(r => setUsdcBalance(r.value.length > 0 ? r.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0 : 0))
      .catch(() => setUsdcBalance(0));
  }, [walletAddress]);

  const refresh = () => {
    if (activeVaultId) { setLoading(true); api.getSnapshot(activeVaultId).then(setSnapshot).finally(() => setLoading(false)); }
  };

  // Aggregated portfolio numbers
  const totalFiat = 2450000;
  const totalStablecoin = 1850000;
  const totalIdle = VAULT_ROWS.reduce((s, v) => s + v.idle, 0);
  const totalDeployed = VAULT_ROWS.reduce((s, v) => s + v.allocated, 0);
  const totalReturn = VAULT_ROWS.reduce((s, v) => s + v.returnAmt, 0);
  const totalNAV = VAULT_ROWS.reduce((s, v) => s + v.nav, 0);

  const bestVault = [...VAULT_ROWS].sort((a, b) => b.returnPct - a.returnPct)[0];
  const worstVault = [...VAULT_ROWS].sort((a, b) => a.returnPct - b.returnPct)[0];
  const idleRatio = totalNAV > 0 ? (totalIdle / totalNAV * 100) : 0;
  const deployedRatio = totalNAV > 0 ? (totalDeployed / totalNAV * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-vault-accent" />
            Client Portfolio Overview
          </h1>
          <p className="text-xs text-vault-muted mt-1">
            View fiat balances, stablecoin balances, idle capital, vault allocations, and current vault performance across your account.
          </p>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Fiat Balance', value: `$${fmt(totalFiat)}`, sub: 'USD across accounts', icon: PiggyBank, color: 'text-white' },
          { label: 'Total Stablecoin Balance', value: `${fmt(totalStablecoin)}`, sub: 'USDC', icon: Wallet, color: 'text-vault-accent' },
          { label: 'Idle Stablecoins', value: `${fmt(totalIdle)}`, sub: 'USDC undeployed', icon: Wallet, color: 'text-yellow-400' },
          { label: 'Deployed Across Vaults', value: `${fmt(totalDeployed)}`, sub: 'USDC in strategies', icon: TrendingUp, color: 'text-green-400' },
          { label: 'Current Performance', value: `+$${fmt(totalReturn)}`, sub: 'Blended return', icon: BarChart3, color: 'text-green-400' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-vault-card border border-vault-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-vault-muted">{label}</p>
              <Icon className="w-3.5 h-3.5 text-vault-muted" />
            </div>
            <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
            <p className="text-[10px] text-vault-muted">{sub}</p>
          </div>
        ))}
      </div>

      {/* On-Chain Wallet (compact) */}
      {walletAddress && (
        <div className="bg-vault-card border border-vault-border rounded-lg px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-vault-muted">Wallet:</span>
            <span className="text-xs font-mono text-white">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
            {usdcBalance !== null && <span className="text-xs text-vault-muted">| USDC: <span className="text-white font-mono">{usdcBalance.toFixed(2)}</span></span>}
            {solBalance !== null && <span className="text-xs text-vault-muted">| SOL: <span className="text-white font-mono">{solBalance.toFixed(4)}</span></span>}
          </div>
          <a href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-vault-accent hover:underline">
            Explorer <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}

      {/* Vault Allocations Table */}
      <Card title="Vault Allocations" subtitle={`${VAULT_ROWS.length} segregated vaults`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-vault-border text-[10px] uppercase tracking-wider text-vault-muted">
                <th className="text-left py-2 pr-2 font-semibold">Vault</th>
                <th className="text-left py-2 pr-2 font-semibold">Strategy / Mandate</th>
                <th className="text-right py-2 pr-2 font-semibold">Allocated</th>
                <th className="text-right py-2 pr-2 font-semibold">Idle</th>
                <th className="text-right py-2 pr-2 font-semibold">Total NAV</th>
                <th className="text-right py-2 pr-2 font-semibold">Alloc %</th>
                <th className="text-center py-2 pr-2 font-semibold">Status</th>
                <th className="text-right py-2 pr-2 font-semibold">Return</th>
                <th className="text-right py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {VAULT_ROWS.map(v => (
                <tr key={v.vault} className="border-b border-vault-border/30 hover:bg-vault-bg/50 transition-colors">
                  <td className="py-2.5 pr-2 font-mono font-semibold text-white">{v.vault}</td>
                  <td className="py-2.5 pr-2">
                    <p className="text-white">{v.strategy}</p>
                    <p className="text-[10px] text-vault-muted">{v.mandate}</p>
                  </td>
                  <td className="py-2.5 pr-2 text-right font-mono text-white">{fmt(v.allocated)}</td>
                  <td className="py-2.5 pr-2 text-right font-mono text-vault-muted">{fmt(v.idle)}</td>
                  <td className="py-2.5 pr-2 text-right font-mono text-white font-semibold">{fmt(v.nav)}</td>
                  <td className="py-2.5 pr-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 bg-vault-border rounded-full overflow-hidden">
                        <div className="h-full bg-vault-accent rounded-full" style={{ width: `${v.allocPct}%` }} />
                      </div>
                      <span className="text-vault-muted w-8 text-right">{v.allocPct}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-center"><StatusBadge status={v.status} /></td>
                  <td className="py-2.5 pr-2 text-right">
                    <p className="text-green-400 font-mono">+{fmt(v.returnAmt)}</p>
                    <p className="text-[10px] text-vault-muted">{v.returnPct}% | APY {v.yieldApy}%</p>
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => setActiveVaultId(v.vault)} className="text-[10px] text-vault-accent hover:underline">View Vault</button>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t border-vault-border bg-vault-bg/30">
                <td className="py-2.5 pr-2 font-semibold text-vault-muted">Total</td>
                <td className="py-2.5 pr-2 text-vault-muted text-[10px]">{VAULT_ROWS.length} vaults</td>
                <td className="py-2.5 pr-2 text-right font-mono text-white font-semibold">{fmt(totalDeployed)}</td>
                <td className="py-2.5 pr-2 text-right font-mono text-vault-muted">{fmt(totalIdle)}</td>
                <td className="py-2.5 pr-2 text-right font-mono text-white font-bold">{fmt(totalNAV)}</td>
                <td className="py-2.5 pr-2 text-right text-vault-muted">100%</td>
                <td className="py-2.5 pr-2" />
                <td className="py-2.5 pr-2 text-right font-mono text-green-400 font-semibold">+{fmt(totalReturn)}</td>
                <td className="py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Vault Performance Cards */}
      <Card title="Current Vault Performance" subtitle="Portfolio-level performance summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-vault-bg rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Best Performing</p>
            <p className="text-sm font-bold text-green-400">{bestVault.vault}</p>
            <p className="text-xs text-vault-muted">{bestVault.strategy} — +{bestVault.returnPct}%</p>
          </div>
          <div className="bg-vault-bg rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Lowest Performing</p>
            <p className="text-sm font-bold text-amber-400">{worstVault.vault}</p>
            <p className="text-xs text-vault-muted">{worstVault.strategy} — +{worstVault.returnPct}%</p>
          </div>
          <div className="bg-vault-bg rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Total Yield Earned</p>
            <p className="text-sm font-bold text-green-400 font-mono">+${fmt(totalReturn)}</p>
            <p className="text-xs text-vault-muted">Across all vaults</p>
          </div>
          <div className="bg-vault-bg rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Idle vs Deployed</p>
            <div className="flex gap-1 mt-1">
              <div className="h-2 rounded-full bg-vault-accent" style={{ width: `${deployedRatio}%`, minWidth: 4 }} title={`Deployed ${deployedRatio.toFixed(0)}%`} />
              <div className="h-2 rounded-full bg-gray-600" style={{ width: `${idleRatio}%`, minWidth: 4 }} title={`Idle ${idleRatio.toFixed(0)}%`} />
            </div>
            <p className="text-[10px] text-vault-muted mt-1">Deployed {deployedRatio.toFixed(0)}% | Idle {idleRatio.toFixed(0)}%</p>
          </div>
        </div>
      </Card>

      {/* Asset Location Summary */}
      <Card title="Asset Location Summary" subtitle="Where your assets are held">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Fiat Accounts', amount: totalFiat, unit: 'USD', color: 'text-white' },
            { label: 'Stablecoin Wallets', amount: totalStablecoin, unit: 'USDC', color: 'text-vault-accent' },
            { label: 'Idle Stablecoins', amount: totalIdle, unit: 'USDC (undeployed)', color: 'text-yellow-400' },
            { label: 'Vaulted Stablecoins', amount: totalDeployed, unit: 'USDC (in strategies)', color: 'text-green-400' },
          ].map(({ label, amount, unit, color }) => (
            <div key={label} className="bg-vault-bg rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">{label}</p>
              <p className={`text-lg font-bold font-mono ${color}`}>{fmt(amount)}</p>
              <p className="text-[10px] text-vault-muted">{unit}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Portfolio Activity */}
      <Card title="Recent Portfolio Activity" subtitle="Latest account movements">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-vault-border text-[10px] uppercase tracking-wider text-vault-muted">
                <th className="text-left py-2 pr-2 font-semibold">Time</th>
                <th className="text-left py-2 pr-2 font-semibold">Activity</th>
                <th className="text-left py-2 pr-2 font-semibold">Vault</th>
                <th className="text-left py-2 pr-2 font-semibold">Asset</th>
                <th className="text-right py-2 pr-2 font-semibold">Amount</th>
                <th className="text-left py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_ACTIVITY.map((a, i) => (
                <tr key={i} className="border-b border-vault-border/30 hover:bg-vault-bg/50 transition-colors">
                  <td className="py-2 pr-2 text-vault-muted whitespace-nowrap">{a.time}</td>
                  <td className="py-2 pr-2">
                    <span className="bg-vault-bg text-white rounded px-1.5 py-0.5 text-[10px] font-medium">{a.activity}</span>
                  </td>
                  <td className="py-2 pr-2 font-mono text-white">{a.vault}</td>
                  <td className="py-2 pr-2 text-white">{a.asset}</td>
                  <td className="py-2 pr-2 text-right font-mono text-white">{fmt(a.amount)}</td>
                  <td className="py-2"><StatusBadge status={a.status.toLowerCase()} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
