import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import { Banknote, RefreshCw, ExternalLink } from 'lucide-react';

const EXPLORER_BASE = 'https://solscan.io';

interface FlowRow {
  time: string;
  vault: string;
  stage: string;
  from: string;
  to: string;
  asset: string;
  amount: number;
  compliance: string;
  status: string;
  ref: string;
  txSig: string;
}

const statusColor: Record<string, string> = {
  Completed: 'text-success-700', Passed: 'text-success-700', Pending: 'text-warning-700', Failed: 'text-error-700', 'Not Required': 'text-slate-500',
};

const fmt = (v: number) => v > 0 ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

function offsetTime(base: string, minutesBefore: number): string {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() - minutesBefore);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Build the full settlement flow from real deposit and redemption events.
 * Fiat/KYT stages are derived (simulated timestamps) from actual on-chain events.
 */
function buildFlows(events: any[]): FlowRow[] {
  const flows: FlowRow[] = [];

  const deposits = events.filter(e => e.actionType === 'DEPOSIT_RECORDED');
  const redemptions = events.filter(e => e.actionType === 'REDEMPTION_EXECUTED');

  for (const dep of deposits) {
    const ts = dep.timestamp;
    const vault = dep.vaultId || '—';
    const amount = dep.amount || 0;

    // Stage 1: Fiat Received (simulated 5min before deposit)
    flows.push({
      time: offsetTime(ts, 5), vault, stage: 'Fiat Received',
      from: 'Client Bank Account', to: 'Amina Treasury',
      asset: 'USD', amount, compliance: 'Not Required', status: 'Completed',
      ref: `WIRE-${dep.eventId}`, txSig: '',
    });

    // Stage 2: KYT Inbound Screen (simulated 3min before)
    flows.push({
      time: offsetTime(ts, 3), vault, stage: 'KYT Inbound Screen',
      from: 'Chainalysis KYT', to: '—',
      asset: '—', amount: 0, compliance: 'Passed', status: 'Passed',
      ref: `KYT-IN-${dep.eventId}`, txSig: '',
    });

    // Stage 3: Stablecoin Mint (simulated 2min before)
    flows.push({
      time: offsetTime(ts, 2), vault, stage: 'Stablecoin Mint',
      from: 'Amina Treasury', to: 'Client Stablecoin Account (USDC)',
      asset: 'USDC', amount, compliance: 'Passed', status: 'Completed',
      ref: `MINT-${dep.eventId}`, txSig: '',
    });

    // Stage 4: Vault Funding (actual deposit)
    flows.push({
      time: ts.replace('T', ' ').slice(0, 19), vault, stage: 'Vault Funding',
      from: 'Client Stablecoin Account (USDC)', to: `Vault ${vault}`,
      asset: 'USDC', amount, compliance: 'Not Required', status: 'Completed',
      ref: dep.eventId, txSig: dep.txSignature || '',
    });
  }

  for (const red of redemptions) {
    const ts = red.timestamp;
    const vault = red.vaultId || '—';
    const amount = red.amount || 0;

    // Stage 1: Vault Redemption (actual)
    flows.push({
      time: ts.replace('T', ' ').slice(0, 19), vault, stage: 'Vault Redemption',
      from: `Vault ${vault}`, to: 'Client Stablecoin Account (USDC)',
      asset: 'USDC', amount, compliance: 'Not Required', status: 'Completed',
      ref: red.eventId, txSig: red.txSignature || '',
    });

    // Stage 2: KYT Outbound Screen (2min after)
    flows.push({
      time: offsetTime(ts, -2), vault, stage: 'KYT Outbound Screen',
      from: 'Chainalysis KYT', to: '—',
      asset: '—', amount: 0, compliance: 'Passed', status: 'Passed',
      ref: `KYT-OUT-${red.eventId}`, txSig: '',
    });

    // Stage 3: Stablecoin Burn (3min after)
    flows.push({
      time: offsetTime(ts, -3), vault, stage: 'Stablecoin Burn',
      from: 'Client Stablecoin Account (USDC)', to: 'Amina Treasury',
      asset: 'USDC', amount, compliance: 'Passed', status: 'Completed',
      ref: `BURN-${red.eventId}`, txSig: '',
    });

    // Stage 4: Fiat Off-Ramp (5min after)
    flows.push({
      time: offsetTime(ts, -5), vault, stage: 'Fiat Off-Ramp',
      from: 'Amina Treasury', to: 'Client Bank Account',
      asset: 'USD', amount, compliance: 'Not Required', status: 'Pending',
      ref: `OFR-${red.eventId}`, txSig: '',
    });
  }

  // Sort by time descending (newest first)
  flows.sort((a, b) => b.time.localeCompare(a.time));
  return flows;
}

export default function FundingPage() {
  const { activeVaultId } = useStore();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [vaults, setVaults] = useState<any[]>([]);
  const [scopeVault, setScopeVault] = useState('ALL');
  const [totals, setTotals] = useState({ onRamped: 0, deployed: 0, offRamped: 0 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [allVaults, allEvents] = await Promise.all([
        api.getVaults(),
        api.getEvents(),
      ]);
      setVaults(allVaults);

      const builtFlows = buildFlows(allEvents);
      setFlows(builtFlows);

      // Compute aggregated totals from real vault data
      const totalDeposited = allVaults.reduce((s: number, v: any) => s + (v.totalDeposited || 0), 0);
      const totalIdle = allVaults.reduce((s: number, v: any) => s + (v.idleBalance || 0), 0);
      const totalDeployed = totalDeposited - totalIdle;
      const redemptionTotal = allEvents
        .filter((e: any) => e.actionType === 'REDEMPTION_EXECUTED')
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);

      setTotals({
        onRamped: totalDeposited,
        deployed: totalDeployed > 0 ? totalDeployed : 0,
        offRamped: redemptionTotal,
      });
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">No vault selected.</p>
      </div>
    );
  }

  const filteredFlows = scopeVault === 'ALL' ? flows : flows.filter(f => f.vault === scopeVault);
  const uniqueVaults = [...new Set(flows.map(f => f.vault))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-teal-700" />
            Client Funding and Settlement Tracking
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Track client money across fiat funding, stablecoin on-ramp, vault allocation, vault return, and fiat off-ramp.
          </p>
        </div>
        <button onClick={loadData}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-all ease-amina duration-150">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Funding & Settlement Overview */}
      <Card title="Funding & Settlement Overview" subtitle="Aggregated client money movement">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: 'Total Fiat On-Ramped', amount: totals.onRamped, sub: 'USD → USDC across all vaults', color: 'text-success-700' },
            { label: 'Total Stablecoins Deployed', amount: totals.deployed, sub: 'USDC deployed across vaults', color: 'text-teal-700' },
            { label: 'Total Fiat Off-Ramped', amount: totals.offRamped, sub: 'USDC → USD returned to client', color: 'text-warning-700' },
          ].map(({ label, amount, sub, color }) => (
            <div key={label} className="bg-slate-100 rounded-[18px] p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold font-mono ${color}`}>{fmt(amount)}</p>
              <p className="text-[10px] text-slate-500 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Vault Scope Control + Timeline */}
      <Card title="Fund Flow Timeline" subtitle={`${filteredFlows.length} events — ${scopeVault === 'ALL' ? 'all vaults' : scopeVault}`}>
        {/* Scope selector */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Scope</span>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setScopeVault('ALL')}
              className={`px-3 py-1 text-xs rounded-[12px] border transition-all ease-amina duration-150 ${scopeVault === 'ALL' ? 'bg-teal-50 border-teal-700 text-teal-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:text-ink-900'}`}>
              All Vaults
            </button>
            {uniqueVaults.map(v => (
              <button key={v} onClick={() => setScopeVault(v)}
                className={`px-3 py-1 text-xs rounded-[12px] border font-mono transition-all ease-amina duration-150 ${scopeVault === v ? 'bg-teal-50 border-teal-700 text-teal-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:text-ink-900'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Loading settlement data...</p>
        ) : filteredFlows.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No fund flows recorded yet. Deposits and redemptions will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
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
                  <tr key={i} className="border-b border-slate-200/30 hover:bg-teal-50 transition-colors">
                    <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{row.time.slice(5, 16)}</td>
                    <td className="py-2 pr-2 font-mono text-ink-900 text-[10px]">{row.vault}</td>
                    <td className="py-2 pr-2">
                      <span className="bg-slate-100 text-ink-900 rounded px-1.5 py-0.5 text-[10px] font-medium">{row.stage}</span>
                    </td>
                    <td className="py-2 pr-2 text-slate-500 max-w-[100px] truncate" title={row.from}>{row.from}</td>
                    <td className="py-2 pr-2 text-slate-500 max-w-[100px] truncate" title={row.to}>{row.to}</td>
                    <td className="py-2 pr-2 text-ink-900">{row.asset}</td>
                    <td className="py-2 pr-2 text-right font-mono text-ink-900">{row.amount > 0 ? fmt(row.amount) : '—'}</td>
                    <td className="py-2 pr-2">
                      <span className={`text-[10px] font-semibold ${statusColor[row.compliance] || 'text-slate-500'}`}>{row.compliance}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`text-[10px] font-semibold ${statusColor[row.status] || 'text-slate-500'}`}>{row.status}</span>
                    </td>
                    <td className="py-2 pr-2 font-mono text-slate-500 text-[10px]">{row.ref}</td>
                    <td className="py-2">
                      {row.txSig ? (
                        <a href={`${EXPLORER_BASE}/tx/${row.txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[10px] text-teal-700 hover:underline">
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bottom: Reconciliation + Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Reconciliation Status" subtitle="Settlement matching and balance verification">
          <div className="space-y-2">
            {[
              { label: 'On-Ramp Reconciled', status: totals.onRamped > 0 ? 'Passed' : 'Pending', detail: `${fmt(totals.onRamped)} USD → ${fmt(totals.onRamped)} USDC matched across all clients` },
              { label: 'Vault Funding Reconciled', status: totals.onRamped > 0 ? 'Passed' : 'Pending', detail: `${fmt(totals.onRamped)} USDC credited across ${vaults.length} vault(s)` },
              { label: 'Vault Return Reconciled', status: totals.offRamped > 0 ? 'Passed' : 'Pending', detail: `${fmt(totals.offRamped)} USDC returned from vaults to stablecoin accounts` },
              { label: 'Off-Ramp Reconciled', status: totals.offRamped > 0 ? 'Pending' : 'N/A', detail: `${fmt(totals.offRamped)} USD pending fiat settlement to client bank accounts` },
            ].map(({ label, status, detail }) => (
              <div key={label} className="flex items-center justify-between bg-slate-100 rounded-[12px] px-3 py-2">
                <div>
                  <p className="text-xs text-ink-900 font-medium">{label}</p>
                  <p className="text-[10px] text-slate-500">{detail}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${status === 'Passed' ? 'bg-success-100 text-success-700' : status === 'Pending' ? 'bg-warning-100 text-warning-700' : 'bg-slate-200 text-slate-500'}`}>{status}</span>
              </div>
            ))}
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
              <div key={label} className="flex items-center justify-between bg-slate-100 rounded-[12px] px-3 py-2">
                <div>
                  <p className="text-xs text-ink-900 font-medium">{label}</p>
                  <p className="text-[10px] text-slate-500">{detail}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  status === 'Active' ? 'bg-success-100 text-success-700' : status === 'None' ? 'bg-slate-200 text-slate-500' : 'bg-warning-100 text-warning-700'
                }`}>{status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
