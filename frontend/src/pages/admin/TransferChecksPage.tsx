import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

const checkColors: Record<string, string> = {
  CLEAR: 'bg-success-100 text-success-700 border-success-700/20',
  COMPLETE: 'bg-success-100 text-success-700 border-success-700/20',
  APPROVED: 'bg-success-100 text-success-700 border-success-700/20',
  PASSED: 'bg-success-100 text-success-700 border-success-700/20',
  NOT_REQUIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  FLAGGED: 'bg-error-100 text-error-700 border-error-700/20',
  PENDING: 'bg-warning-100 text-warning-700 border-warning-700/20',
  BLOCKED: 'bg-error-100 text-error-700 border-error-700/20',
  PENDING_REVIEW: 'bg-warning-100 text-warning-700 border-warning-700/20',
};

const typeLabels: Record<string, string> = {
  DEPOSIT: 'Deposit',
  ALLOCATION: 'Allocation',
  REDEMPTION: 'Redemption',
  UNWIND: 'Unwind',
};

export default function TransferChecksPage() {
  const [checks, setChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getTransferChecks();
        setChecks(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = filter ? checks.filter(c => c.transferType === filter) : checks;

  if (loading) return <div className="p-6 text-slate-500">Loading transfer checks...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Transfer Check Matrix</h1>
        <p className="text-sm text-slate-500 mt-1">KYT, OFAC, and Travel Rule checks for every fund movement. Each check shown separately.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip label="All" active={!filter} onClick={() => setFilter('')} />
        <FilterChip label="Deposits" active={filter === 'DEPOSIT'} onClick={() => setFilter('DEPOSIT')} />
        <FilterChip label="Allocations" active={filter === 'ALLOCATION'} onClick={() => setFilter('ALLOCATION')} />
        <FilterChip label="Redemptions" active={filter === 'REDEMPTION'} onClick={() => setFilter('REDEMPTION')} />
        <FilterChip label="Unwinds" active={filter === 'UNWIND'} onClick={() => setFilter('UNWIND')} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Type</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">From</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">From Controller</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">To</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">To Controller</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Amount</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tx</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">KYT</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">OFAC</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Travel Rule</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tc: any) => (
              <tr
                key={tc.id}
                className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => setSelected(tc)}
              >
                <td className="px-3 py-3">
                  <span className="text-xs font-medium text-ink-900">{typeLabels[tc.transferType] || tc.transferType}</span>
                </td>
                <td className="px-3 py-3">
                  <code className="text-[11px] text-slate-600 font-mono">{truncate(tc.fromAddress)}</code>
                </td>
                <td className="px-3 py-3 text-xs text-ink-900 font-medium">{tc.fromController}</td>
                <td className="px-3 py-3">
                  <code className="text-[11px] text-slate-600 font-mono">{truncate(tc.toAddress)}</code>
                </td>
                <td className="px-3 py-3 text-xs text-ink-900 font-medium">{tc.toController}</td>
                <td className="px-3 py-3 text-xs text-ink-900 font-medium">{Number(tc.amount).toLocaleString()} {tc.asset}</td>
                <td className="px-3 py-3">
                  {tc.txSignature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${tc.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-teal-100 text-teal-700 border-teal-300/40 hover:bg-teal-200 transition-colors"
                    >
                      {tc.txSignature.slice(0, 8)}...
                    </a>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 text-slate-500 border-slate-200">
                      Bank Transfer
                    </span>
                  )}
                </td>
                <td className="px-3 py-3"><CheckBadge status={tc.kytStatus} /></td>
                <td className="px-3 py-3"><CheckBadge status={tc.ofacStatus} /></td>
                <td className="px-3 py-3"><CheckBadge status={tc.travelRuleStatus} /></td>
                <td className="px-3 py-3"><CheckBadge status={tc.overallStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No transfer checks found.</div>
        )}
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="bg-black/20 absolute inset-0" />
          <div className="relative bg-white w-full max-w-md shadow-2xl border-l border-slate-200 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-ink-900">Transfer Detail</h3>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-ink-900 text-lg">&times;</button>
              </div>

              <div className="space-y-3">
                <DetailRow label="Transfer ID" value={selected.transferId} />
                <DetailRow label="Type" value={typeLabels[selected.transferType]} />
                <DetailRow label="Vault" value={selected.vaultId} />
                <DetailRow label="From" value={selected.fromAddress} mono />
                <DetailRow label="From Controller" value={selected.fromController} />
                <DetailRow label="To" value={selected.toAddress} mono />
                <DetailRow label="To Controller" value={selected.toController} />
                <DetailRow label="Asset" value={selected.asset} />
                <DetailRow label="Amount" value={`${Number(selected.amount).toLocaleString()} ${selected.asset}`} />
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs text-slate-500">Settlement</span>
                  {selected.txSignature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${selected.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-700 font-medium font-mono hover:underline"
                    >
                      {selected.txSignature.slice(0, 16)}...
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 font-medium">Bank Transfer (off-chain)</span>
                  )}
                </div>
              </div>

              <hr className="border-slate-200" />
              <h4 className="text-sm font-semibold text-ink-900">Compliance Checks</h4>

              <div className="space-y-3">
                <CheckRow label="KYT Risk Screening" status={selected.kytStatus} reference={selected.kytReference} />
                <CheckRow label="OFAC / Sanctions Screening" status={selected.ofacStatus} reference={selected.ofacReference} />
                <CheckRow label="Travel Rule Review" status={selected.travelRuleStatus} reference={selected.travelRuleReference} />
                {selected.providerApproval && <CheckRow label="Provider Approval" status={selected.providerApproval} />}
                {selected.mandateCheck && <CheckRow label="Mandate Check" status={selected.mandateCheck} />}
              </div>

              <hr className="border-slate-200" />
              <DetailRow label="Overall Status" value={selected.overallStatus} />
              <DetailRow label="Checked At" value={new Date(selected.checkedAt).toLocaleString()} />
              <DetailRow label="Checked By" value={selected.checkedBy || 'System'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckBadge({ status }: { status: string }) {
  const color = checkColors[status] || 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${color}`}>{status.replace(/_/g, ' ')}</span>;
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
        active ? 'bg-teal-100 text-teal-700 border-teal-300/40' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs text-ink-900 font-medium text-right max-w-[220px] break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function CheckRow({ label, status, reference }: { label: string; status: string; reference?: string }) {
  const color = checkColors[status] || 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${color}`}>{status.replace(/_/g, ' ')}</span>
        {reference && (
          <a href="#" className="text-[10px] text-teal-700 hover:underline">{reference.includes('chainalysis') ? 'View in Chainalysis' : 'View'}</a>
        )}
      </div>
    </div>
  );
}

function truncate(addr: string) {
  if (!addr) return '';
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}
