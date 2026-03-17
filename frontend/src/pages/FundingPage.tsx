import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { Banknote, RefreshCw, ExternalLink } from 'lucide-react';

const EXPLORER_BASE = 'https://explorer.solana.com/tx';

// Dummy aggregated data
const AGGREGATED = {
  totalOnRamped: 2500000,
  totalDeployed: 1750000,
  totalOffRamped: 350000,
};

// Full fund flow timeline (deposit + withdrawal lifecycle)
const ALL_FLOWS = [
  // === DEPOSIT FLOW: Client 1 - VLT-001 ===
  { time: '2026-03-15 09:10:00', vault: 'VLT-001', stage: 'Fiat Received', from: 'User Bank Account (Amina USD)', to: 'Amina Treasury', asset: 'USD', amount: 1000000, compliance: 'Not Required', status: 'Completed', ref: 'WIRE-CH-88201', txSig: '' },
  { time: '2026-03-15 09:12:14', vault: 'VLT-001', stage: 'KYT Inbound Screen', from: 'Chainalysis KYT', to: '—', asset: '—', amount: 0, compliance: 'Passed', status: 'Passed', ref: 'KYT-IN-4421', txSig: '' },
  { time: '2026-03-15 09:13:02', vault: 'VLT-001', stage: 'Stablecoin Mint', from: 'Amina Treasury', to: 'User Stablecoin Account (USDC)', asset: 'USDC', amount: 1000000, compliance: 'Passed', status: 'Completed', ref: 'MINT-20260315-001', txSig: 'bMWvcT3Pi5Tntk1AjQvQkFu4aoyeFn9eBFCTJNV3CT2' },
  { time: '2026-03-15 09:15:02', vault: 'VLT-001', stage: 'Vault Funding', from: 'User Stablecoin Account (USDC)', to: 'Vault VLT-001', asset: 'USDC', amount: 1000000, compliance: 'Not Required', status: 'Completed', ref: 'SRC-7781', txSig: '5xKzRn8WvPqYh3DjRZoLmN7tBcF4Q2AjVn9sUeW1d7R' },

  // === DEPOSIT FLOW: Client 2 - VLT-002 ===
  { time: '2026-03-15 11:20:00', vault: 'VLT-002', stage: 'Fiat Received', from: 'User Bank Account (Amina USD)', to: 'Amina Treasury', asset: 'USD', amount: 1500000, compliance: 'Not Required', status: 'Completed', ref: 'WIRE-SG-44102', txSig: '' },
  { time: '2026-03-15 11:22:30', vault: 'VLT-002', stage: 'KYT Inbound Screen', from: 'Chainalysis KYT', to: '—', asset: '—', amount: 0, compliance: 'Passed', status: 'Passed', ref: 'KYT-IN-4422', txSig: '' },
  { time: '2026-03-15 11:24:10', vault: 'VLT-002', stage: 'Stablecoin Mint', from: 'Amina Treasury', to: 'User Stablecoin Account (USDC)', asset: 'USDC', amount: 1500000, compliance: 'Passed', status: 'Completed', ref: 'MINT-20260315-002', txSig: '7pLmN3Rv2WqXh8DjZoKzRn4tBcF9Q5AjVn6sUeW2e8S' },
  { time: '2026-03-15 11:26:05', vault: 'VLT-002', stage: 'Vault Funding', from: 'User Stablecoin Account (USDC)', to: 'Vault VLT-002', asset: 'USDC', amount: 1500000, compliance: 'Not Required', status: 'Completed', ref: 'SRC-8892', txSig: '3mYkN7Qv1TpWh5FjXoRzKn2tAcG8P4BjUn7rSeV3f9T' },

  // === WITHDRAWAL FLOW: Client 1 - VLT-001 ===
  { time: '2026-03-16 14:20:00', vault: 'VLT-001', stage: 'Vault Redemption', from: 'Vault VLT-001', to: 'User Stablecoin Account (USDC)', asset: 'USDC', amount: 250000, compliance: 'Not Required', status: 'Completed', ref: 'RET-20260316-001', txSig: '9nZlO8Sw3UrYi6GkAoTzMn5uCdH0R7CkWo8tVfX4g0U' },
  { time: '2026-03-16 14:22:45', vault: 'VLT-001', stage: 'KYT Outbound Screen', from: 'Chainalysis KYT', to: '—', asset: '—', amount: 0, compliance: 'Passed', status: 'Passed', ref: 'KYT-OUT-5501', txSig: '' },
  { time: '2026-03-16 14:25:10', vault: 'VLT-001', stage: 'Stablecoin Burn', from: 'User Stablecoin Account (USDC)', to: 'Amina Treasury', asset: 'USDC', amount: 250000, compliance: 'Passed', status: 'Completed', ref: 'BURN-20260316-001', txSig: '2oAmP9Tx4VsZj7HlBoUzNn6vDeI1S8DlXp9uWgY5h1V' },
  { time: '2026-03-16 14:30:00', vault: 'VLT-001', stage: 'Fiat Off-Ramp', from: 'Amina Treasury', to: 'User Bank Account (Amina USD)', asset: 'USD', amount: 250000, compliance: 'Not Required', status: 'Pending', ref: 'OFR-20260316-001', txSig: '' },

  // === WITHDRAWAL FLOW: Client 2 partial ===
  { time: '2026-03-17 10:05:00', vault: 'VLT-002', stage: 'Vault Redemption', from: 'Vault VLT-002', to: 'User Stablecoin Account (USDC)', asset: 'USDC', amount: 100000, compliance: 'Not Required', status: 'Completed', ref: 'RET-20260317-001', txSig: '4pBnQ0Uy5WtAk8ImCpVzOn7wEfJ2T9EmYq0vXhZ6i2W' },
  { time: '2026-03-17 10:07:20', vault: 'VLT-002', stage: 'KYT Outbound Screen', from: 'Chainalysis KYT', to: '—', asset: '—', amount: 0, compliance: 'Passed', status: 'Passed', ref: 'KYT-OUT-5502', txSig: '' },
  { time: '2026-03-17 10:10:00', vault: 'VLT-002', stage: 'Stablecoin Burn', from: 'User Stablecoin Account (USDC)', to: 'Amina Treasury', asset: 'USDC', amount: 100000, compliance: 'Passed', status: 'Completed', ref: 'BURN-20260317-001', txSig: '6qCnR1Vz6XuBl9JnDqWzPo8xFgK3U0FnZr1wYiA7j3X' },
  { time: '2026-03-17 10:15:00', vault: 'VLT-002', stage: 'Fiat Off-Ramp', from: 'Amina Treasury', to: 'User Bank Account (Amina USD)', asset: 'USD', amount: 100000, compliance: 'Not Required', status: 'Pending', ref: 'OFR-20260317-001', txSig: '' },
];

const statusColor: Record<string, string> = {
  Completed: 'text-green-400', Passed: 'text-green-400', Pending: 'text-yellow-400', Failed: 'text-red-400', 'Not Required': 'text-vault-muted',
};

const fmt = (v: number) => v > 0 ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export default function FundingPage() {
  const { activeVaultId } = useStore();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vaults, setVaults] = useState<any[]>([]);
  const [scopeVault, setScopeVault] = useState('ALL');

  useEffect(() => {
    api.getVaults().then(setVaults).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeVaultId) return;
    setLoading(true);
    api.getSnapshot(activeVaultId).then(setSnapshot).catch(() => {}).finally(() => setLoading(false));
  }, [activeVaultId]);

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-vault-muted text-sm">No vault selected.</p>
      </div>
    );
  }

  const filteredFlows = scopeVault === 'ALL' ? ALL_FLOWS : ALL_FLOWS.filter(f => f.vault === scopeVault);
  const uniqueVaults = [...new Set(ALL_FLOWS.map(f => f.vault))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-vault-accent" />
            Client Funding and Settlement Tracking
          </h1>
          <p className="text-xs text-vault-muted mt-1 max-w-2xl">
            Track client money across fiat funding, stablecoin on-ramp, vault allocation, vault return, and fiat off-ramp.
          </p>
        </div>
        <button onClick={() => { setLoading(true); api.getSnapshot(activeVaultId!).then(setSnapshot).finally(() => setLoading(false)); }}
          className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Funding & Settlement Overview */}
      <Card title="Funding & Settlement Overview" subtitle="Aggregated client money movement">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: 'Total Fiat On-Ramped', amount: AGGREGATED.totalOnRamped, sub: 'USD → USDC across all vaults', color: 'text-green-400' },
            { label: 'Total Stablecoins Deployed', amount: AGGREGATED.totalDeployed, sub: 'USDC deployed across vaults', color: 'text-vault-accent' },
            { label: 'Total Fiat Off-Ramped', amount: AGGREGATED.totalOffRamped, sub: 'USDC → USD returned to client', color: 'text-amber-400' },
          ].map(({ label, amount, sub, color }) => (
            <div key={label} className="bg-vault-bg rounded-lg p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">{label}</p>
              <p className={`text-2xl font-bold font-mono ${color}`}>{fmt(amount)}</p>
              <p className="text-[10px] text-vault-muted mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Vault Scope Control + Timeline */}
      <Card title="Fund Flow Timeline" subtitle={`${filteredFlows.length} events — ${scopeVault === 'ALL' ? 'all vaults' : scopeVault}`}>
        {/* Scope selector */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Scope</span>
          <div className="flex gap-1.5">
            <button onClick={() => setScopeVault('ALL')}
              className={`px-3 py-1 text-xs rounded border transition-colors ${scopeVault === 'ALL' ? 'bg-vault-accent/10 border-vault-accent text-vault-accent font-semibold' : 'bg-vault-bg border-vault-border text-vault-muted hover:text-white'}`}>
              All Vaults
            </button>
            {uniqueVaults.map(v => (
              <button key={v} onClick={() => setScopeVault(v)}
                className={`px-3 py-1 text-xs rounded border font-mono transition-colors ${scopeVault === v ? 'bg-vault-accent/10 border-vault-accent text-vault-accent font-semibold' : 'bg-vault-bg border-vault-border text-vault-muted hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-vault-border text-[10px] uppercase tracking-wider text-vault-muted">
                <th className="text-left py-2 pr-2 font-semibold">Time</th>
                <th className="text-left py-2 pr-2 font-semibold">Vault</th>
                <th className="text-left py-2 pr-2 font-semibold">Flow Stage</th>
                <th className="text-left py-2 pr-2 font-semibold">From</th>
                <th className="text-left py-2 pr-2 font-semibold">To</th>
                <th className="text-left py-2 pr-2 font-semibold">Asset</th>
                <th className="text-right py-2 pr-2 font-semibold">Amount</th>
                <th className="text-left py-2 pr-2 font-semibold">Compliance</th>
                <th className="text-left py-2 pr-2 font-semibold">Status</th>
                <th className="text-left py-2 pr-2 font-semibold">Reference</th>
                <th className="text-left py-2 font-semibold">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlows.map((row, i) => (
                <tr key={i} className="border-b border-vault-border/30 hover:bg-vault-bg/50 transition-colors">
                  <td className="py-2 pr-2 text-vault-muted whitespace-nowrap">{row.time.slice(5, 16)}</td>
                  <td className="py-2 pr-2 font-mono text-white text-[10px]">{row.vault}</td>
                  <td className="py-2 pr-2">
                    <span className="bg-vault-bg text-white rounded px-1.5 py-0.5 text-[10px] font-medium">{row.stage}</span>
                  </td>
                  <td className="py-2 pr-2 text-vault-muted max-w-[100px] truncate" title={row.from}>{row.from}</td>
                  <td className="py-2 pr-2 text-vault-muted max-w-[100px] truncate" title={row.to}>{row.to}</td>
                  <td className="py-2 pr-2 text-white">{row.asset}</td>
                  <td className="py-2 pr-2 text-right font-mono text-white">{row.amount > 0 ? fmt(row.amount) : '—'}</td>
                  <td className="py-2 pr-2">
                    <span className={`text-[10px] font-semibold ${statusColor[row.compliance] || 'text-vault-muted'}`}>{row.compliance}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <span className={`text-[10px] font-semibold ${statusColor[row.status] || 'text-vault-muted'}`}>{row.status}</span>
                  </td>
                  <td className="py-2 pr-2 font-mono text-vault-muted text-[10px]">{row.ref}</td>
                  <td className="py-2">
                    {row.txSig ? (
                      <a href={`${EXPLORER_BASE}/${row.txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-vault-accent hover:underline">
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-vault-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>


      {/* Bottom: Reconciliation + Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Reconciliation Status" subtitle="Settlement matching and balance verification">
          <div className="space-y-2">
            {[
              { label: 'On-Ramp Reconciled', status: 'Passed', detail: '2,500,000 USD → 2,500,000 USDC matched across all clients' },
              { label: 'Vault Funding Reconciled', status: 'Passed', detail: '2,500,000 USDC credited across VLT-001, VLT-002' },
              { label: 'Vault Return Reconciled', status: 'Passed', detail: '350,000 USDC returned from vaults to stablecoin accounts' },
              { label: 'Off-Ramp Reconciled', status: 'Pending', detail: '350,000 USD pending fiat settlement to client bank accounts' },
            ].map(({ label, status, detail }) => (
              <div key={label} className="flex items-center justify-between bg-vault-bg rounded px-3 py-2">
                <div>
                  <p className="text-xs text-white font-medium">{label}</p>
                  <p className="text-[10px] text-vault-muted">{detail}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${status === 'Passed' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>{status}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-vault-border flex justify-between text-[10px]">
              <span className="text-vault-muted">Last Updated</span>
              <span className="text-white">Mar 17, 2026 10:20 UTC</span>
            </div>
          </div>
        </Card>

        <Card title="Monitoring & Control Status" subtitle="Compliance checks for fund movement">
          <div className="space-y-2">
            {[
              { label: 'Wallet Verification', status: 'Active', detail: 'Owner wallets verified via SAS attestation' },
              { label: 'Source Reference Present', status: 'Active', detail: 'All deposits have provenance references' },
              { label: 'KYT Screening', status: 'Active', detail: 'Chainalysis KYT on all on-ramp and off-ramp legs' },
              { label: 'Travel Rule Edge Check', status: 'Active', detail: 'External transfers checked against FATF Travel Rule' },
              { label: 'Explorer Trace Available', status: 'Active', detail: 'On-chain legs traceable via Solana Explorer' },
              { label: 'Active Exceptions', status: 'None', detail: 'No flagged transactions or exceptions' },
            ].map(({ label, status, detail }) => (
              <div key={label} className="flex items-center justify-between bg-vault-bg rounded px-3 py-2">
                <div>
                  <p className="text-xs text-white font-medium">{label}</p>
                  <p className="text-[10px] text-vault-muted">{detail}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  status === 'Active' ? 'bg-green-900/30 text-green-400' : status === 'None' ? 'bg-vault-border text-vault-muted' : 'bg-yellow-900/30 text-yellow-400'
                }`}>{status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
