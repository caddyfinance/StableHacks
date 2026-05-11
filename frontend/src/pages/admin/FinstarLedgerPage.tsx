import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { Landmark, FileText, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Copy, Check, Vault } from 'lucide-react';

const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  Deposit: 'Deposit',
  Withdrawal: 'Withdrawal',
  YieldAccrual: 'Yield Accrual',
  FeeDebit: 'Fee Debit',
  StrategyAllocation: 'Strategy Allocation',
  StrategyUnwind: 'Strategy Unwind',
  Transfer: 'Transfer',
};

const STATUS_COLORS: Record<string, string> = {
  Posted: 'bg-success-100 text-success-700',
  Pending: 'bg-warning-100 text-warning-700',
  Reversed: 'bg-error-100 text-error-700',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="ml-1 text-slate-400 hover:text-teal-700 transition-colors">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export default function FinstarLedgerPage() {
  const { activeVaultId, setActiveVaultId } = useStore();
  const [vaults, setVaults] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getVaults().then(setVaults).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cfg = await api.finstarGetConfig().catch(() => null);
      setConfig(cfg);

      if (activeVaultId) {
        const [led, reps] = await Promise.all([
          api.finstarGetLedger(activeVaultId).catch(() => null),
          api.finstarGetReports(activeVaultId).catch(() => []),
        ]);
        setLedger(led);
        setReports(reps);
      }
      setLoading(false);
    };
    load();
  }, [activeVaultId]);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading Finstar ledger...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Finstar Core Banking Ledger</h1>
          <p className="text-sm text-slate-700 mt-1">
            Layer 1 — HBL ASP/BSP general ledger book-back proof
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Vault className="w-4 h-4 text-slate-400" />
          <select
            value={activeVaultId || ''}
            onChange={(e) => setActiveVaultId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors min-w-[180px]"
          >
            <option value="">Select vault...</option>
            {vaults.map((v: any) => (
              <option key={v.vaultId} value={v.vaultId}>
                {v.vaultId} — {v.clientReference || v.credentialId?.slice(0, 12)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Config Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
          <Landmark size={20} className="text-slate-600 mb-2" />
          <p className="text-lg font-bold text-ink-900">{config?.institutionName || 'AMINA Bank AG'}</p>
          <p className="text-xs text-slate-700 mt-1">Institution</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Core banking provider: Finstar (via HBL)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
          <FileText size={20} className="text-slate-600 mb-2" />
          <p className="text-2xl font-bold text-ink-900 font-mono">{config?.totalEntries || 0}</p>
          <p className="text-xs text-slate-700 mt-1">Total GL Entries</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Across all vaults</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
          <ArrowDownToLine size={20} className="text-success-700 mb-2" />
          <p className="text-2xl font-bold text-ink-900 font-mono">{fmt(ledger?.totalCredits || 0)}</p>
          <p className="text-xs text-slate-700 mt-1">Total Credits</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{activeVaultId || 'No vault selected'}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
          <ArrowUpFromLine size={20} className="text-error-700 mb-2" />
          <p className="text-2xl font-bold text-ink-900 font-mono">{fmt(ledger?.totalDebits || 0)}</p>
          <p className="text-xs text-slate-700 mt-1">Total Debits</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Running balance: {fmt(ledger?.runningBalance || 0)}</p>
        </div>
      </div>

      {!activeVaultId && (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-6 text-center">
          <Landmark className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-700 font-medium">No vault selected</p>
          <p className="text-xs text-slate-500 mt-1">Select a vault from the dropdown above to view its Finstar GL ledger.</p>
        </div>
      )}

      {/* GL Entry Table */}
      {activeVaultId && ledger?.entries && ledger.entries.length > 0 && (
        <Card title="General Ledger Entries" subtitle={`${ledger.entries.length} entries for vault ${activeVaultId}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-semibold">Entry ID</th>
                  <th className="text-left py-2 pr-3 font-semibold">Type</th>
                  <th className="text-right py-2 pr-3 font-semibold">Amount</th>
                  <th className="text-left py-2 pr-3 font-semibold">Currency</th>
                  <th className="text-left py-2 pr-3 font-semibold">Debit Account</th>
                  <th className="text-left py-2 pr-3 font-semibold">Credit Account</th>
                  <th className="text-left py-2 pr-3 font-semibold">SWIFT Ref</th>
                  <th className="text-left py-2 pr-3 font-semibold">Status</th>
                  <th className="text-left py-2 font-semibold">Posted At</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry: any, i: number) => (
                  <tr key={entry.entryId || i} className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors">
                    <td className="py-2.5 pr-3 font-mono text-ink-900">
                      {entry.entryId}
                      <CopyButton text={entry.entryId} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-ink-900 rounded font-medium">
                        {ENTRY_TYPE_LABELS[entry.entryType] || entry.entryType}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-ink-900">{fmt(entry.amount)}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{entry.currency}</td>
                    <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-600">{entry.debitAccount}</td>
                    <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-600">{entry.creditAccount}</td>
                    <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-500">{entry.swiftRef || '—'}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_COLORS[entry.status] || 'bg-slate-100 text-slate-700'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500 whitespace-nowrap">
                      {entry.postedAt ? new Date(Number(entry.postedAt) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeVaultId && (!ledger?.entries || ledger.entries.length === 0) && (
        <Card title="General Ledger Entries" subtitle={`Vault ${activeVaultId}`}>
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No GL entries yet for this vault.</p>
            <p className="text-xs text-slate-400 mt-1">GL entries are created when transactions flow through the translation layer.</p>
          </div>
        </Card>
      )}

      {/* Regulatory Reports */}
      {activeVaultId && reports.length > 0 && (
        <Card title="Regulatory Reports" subtitle={`${reports.length} reports filed`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-semibold">Report ID</th>
                  <th className="text-left py-2 pr-3 font-semibold">Type</th>
                  <th className="text-left py-2 pr-3 font-semibold">Jurisdiction</th>
                  <th className="text-left py-2 pr-3 font-semibold">Data Hash</th>
                  <th className="text-left py-2 pr-3 font-semibold">Generated At</th>
                  <th className="text-left py-2 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any, i: number) => (
                  <tr key={r.reportId || i} className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors">
                    <td className="py-2.5 pr-3 font-mono text-ink-900">{r.reportId}</td>
                    <td className="py-2.5 pr-3">
                      <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">{r.reportType}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">{r.jurisdiction}</td>
                    <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-400">{r.dataHash?.substring(0, 16)}...</td>
                    <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">
                      {r.generatedAt ? new Date(Number(r.generatedAt) * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={r.submitted ? 'active' : 'pending'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Finstar Info Footer */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-900">Finstar Core Banking (via HBL ASP/BSP)</p>
            <p className="text-xs text-slate-500">
              Layer 1 of AMINA's three-layer architecture. Every capital movement books back to the General Ledger.
              Partner ID: <span className="font-mono">{config?.hblPartnerId || 'HBL-ASP-001'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
