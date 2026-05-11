import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
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

const typeColors: Record<string, string> = {
  DEPOSIT: 'bg-teal-100 text-teal-700 border-teal-300/40',
  ALLOCATION: 'bg-purple-100 text-purple-700 border-purple-300/40',
  REDEMPTION: 'bg-orange-100 text-orange-700 border-orange-300/40',
  UNWIND: 'bg-blue-100 text-blue-700 border-blue-300/40',
};

const PAGE_SIZES = [10, 20, 50, 100];

export default function TransferChecksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [transferType, setTransferType] = useState('');
  const [overallStatus, setOverallStatus] = useState('');
  const [kytStatus, setKytStatus] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTransferChecks({
        page,
        limit,
        search: search || undefined,
        transferType: transferType || undefined,
        overallStatus: overallStatus || undefined,
        kytStatus: kytStatus || undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, transferType, overallStatus, kytStatus, minAmount, maxAmount]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setTransferType('');
    setOverallStatus('');
    setKytStatus('');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
  };

  const hasFilters = search || transferType || overallStatus || kytStatus || minAmount || maxAmount;

  const selectClass = 'px-2.5 py-1.5 rounded-[10px] bg-white border border-slate-200 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors';
  const inputClass = 'w-full px-2.5 py-1.5 rounded-[10px] bg-white border border-slate-200 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors';

  return (
    <div className="p-6 space-y-6 max-w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Transfer Check Matrix</h1>
        <p className="text-sm text-slate-500 mt-1">KYT, OFAC, and Travel Rule checks for every fund movement — dynamically recorded.</p>
      </div>

      {/* Filters Row */}
      <div className="bg-white rounded-[14px] border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search address, vault, controller..."
              className={`${inputClass} pl-8`}
            />
          </div>

          {/* Type */}
          <select value={transferType} onChange={(e) => { setTransferType(e.target.value); setPage(1); }} className={selectClass}>
            <option value="">All Types</option>
            <option value="DEPOSIT">Deposit</option>
            <option value="ALLOCATION">Allocation</option>
            <option value="REDEMPTION">Redemption</option>
            <option value="UNWIND">Unwind</option>
          </select>

          {/* Overall Status */}
          <select value={overallStatus} onChange={(e) => { setOverallStatus(e.target.value); setPage(1); }} className={selectClass}>
            <option value="">All Statuses</option>
            <option value="PASSED">Passed</option>
            <option value="BLOCKED">Blocked</option>
            <option value="PENDING_REVIEW">Pending Review</option>
          </select>

          {/* KYT Status */}
          <select value={kytStatus} onChange={(e) => { setKytStatus(e.target.value); setPage(1); }} className={selectClass}>
            <option value="">KYT: All</option>
            <option value="CLEAR">Clear</option>
            <option value="FLAGGED">Flagged</option>
            <option value="PENDING">Pending</option>
            <option value="NOT_REQUIRED">Not Required</option>
          </select>

          {/* Amount Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={minAmount}
              onChange={(e) => { setMinAmount(e.target.value); setPage(1); }}
              placeholder="Min amount"
              className={`${inputClass} w-24`}
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }}
              placeholder="Max amount"
              className={`${inputClass} w-24`}
            />
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-error-700 transition-colors whitespace-nowrap">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Summary line */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-400">
            {loading ? 'Loading...' : `${total} result${total !== 1 ? 's' : ''} found`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Rows:</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-ink-900 focus:outline-none"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Type</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Vault</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">From</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">From Controller</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">To</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">To Controller</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Amount</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tx</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">KYT</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">OFAC</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Travel Rule</th>
              <th className="px-3 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Overall</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="px-6 py-8 text-center text-sm text-slate-400 animate-pulse">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={12} className="px-6 py-8 text-center text-sm text-slate-400">No transfer checks found.</td></tr>
            ) : (
              items.map((tc: any) => (
                <tr
                  key={tc.id}
                  className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => setSelected(tc)}
                >
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium whitespace-nowrap ${typeColors[tc.transferType] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {typeLabels[tc.transferType] || tc.transferType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[11px] font-mono text-ink-900">{tc.vaultId}</td>
                  <td className="px-3 py-3">
                    <code className="text-[11px] text-slate-600 font-mono">{truncate(tc.fromAddress)}</code>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-900 font-medium">{tc.fromController}</td>
                  <td className="px-3 py-3">
                    <code className="text-[11px] text-slate-600 font-mono">{truncate(tc.toAddress)}</code>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-900 font-medium">{tc.toController}</td>
                  <td className="px-3 py-3 text-xs text-ink-900 font-medium font-mono">{Number(tc.amount).toLocaleString()} <span className="text-slate-400">{tc.asset}</span></td>
                  <td className="px-3 py-3">
                    {tc.txSignature ? (
                      <a href={`https://explorer.solana.com/tx/${tc.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-teal-100 text-teal-700 border-teal-300/40 hover:bg-teal-200 transition-colors">
                        {tc.txSignature.slice(0, 8)}...
                      </a>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 text-slate-500 border-slate-200">Bank</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><CheckBadge status={tc.kytStatus} /></td>
                  <td className="px-3 py-3"><CheckBadge status={tc.ofacStatus} /></td>
                  <td className="px-3 py-3"><CheckBadge status={tc.travelRuleStatus} /></td>
                  <td className="px-3 py-3"><CheckBadge status={tc.overallStatus} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400">
          Page {page} of {totalPages || 1} · Showing {items.length} of {total}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)} disabled={page <= 1}
            className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >First</button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          ><ChevronLeft className="w-3.5 h-3.5" /></button>

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === '...' ? (
              <span key={`dot-${i}`} className="px-1 text-xs text-slate-400">...</span>
            ) : (
              <button key={p} onClick={() => setPage(p as number)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  page === p ? 'bg-teal-700 text-white border-teal-700 font-medium' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          ><ChevronRight className="w-3.5 h-3.5" /></button>
          <button
            onClick={() => setPage(totalPages)} disabled={page >= totalPages}
            className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >Last</button>
        </div>
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
                    <a href={`https://explorer.solana.com/tx/${selected.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-teal-700 font-medium font-mono hover:underline">
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

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function CheckBadge({ status }: { status: string }) {
  const color = checkColors[status] || 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${color}`}>{status.replace(/_/g, ' ')}</span>;
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
