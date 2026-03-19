import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import {
  ScrollText, RefreshCw, ExternalLink, Download, Search,
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, Shield, Building2,
  FileCheck, Wallet, AlertTriangle, UserCheck, ChevronDown, ChevronUp,
  Filter,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface AuditEntry {
  eventId: string;
  timestamp: string;
  actionType: string;
  actor: string;
  role: string;
  vaultId?: string;
  clientReference?: string;
  amount?: number;
  asset?: string;
  strategy?: string;
  result: string;
  reason: string;
  txSignature?: string;
  onChainAddress?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso || '—'; }
};

const truncate = (s: string, len = 14) =>
  s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

// ─── Category classification ────────────────────────────────────
type Category = 'all' | 'admin' | 'client_funds' | 'portfolio' | 'compliance' | 'emergency';

interface CategoryConfig {
  label: string;
  icon: typeof ScrollText;
  color: string;
  actionTypes: string[];
}

const CATEGORIES: Record<Category, CategoryConfig> = {
  all: { label: 'All Activity', icon: ScrollText, color: 'text-ink-900', actionTypes: [] },
  admin: {
    label: 'Administration',
    icon: Shield,
    color: 'text-teal-700',
    actionTypes: ['CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED', 'VAULT_CREATED', 'MANDATE_ATTACHED', 'MANDATE_UPDATED'],
  },
  client_funds: {
    label: 'Client Fund Movement',
    icon: Wallet,
    color: 'text-success-700',
    actionTypes: ['ONRAMP_COMPLETED', 'OFFRAMP_REQUESTED', 'OFFRAMP_COMPLETED', 'DEPOSIT_RECORDED', 'WITHDRAWAL_REQUESTED', 'REDEMPTION_EXECUTED'],
  },
  portfolio: {
    label: 'Portfolio Execution',
    icon: TrendingUp,
    color: 'text-teal-600',
    actionTypes: ['ALLOCATION_EXECUTED', 'ALLOCATION_BLOCKED', 'CONSENT_REQUESTED', 'CONSENT_GRANTED', 'CONSENT_DENIED', 'SOLSTICE_LOCK', 'SOLSTICE_UNLOCK'],
  },
  compliance: {
    label: 'Compliance & Audit',
    icon: FileCheck,
    color: 'text-warning-700',
    actionTypes: ['COMPLIANCE_CHECK', 'WITHDRAWAL_BLOCKED', 'KYT_SCREENING'],
  },
  emergency: {
    label: 'Emergency Actions',
    icon: AlertTriangle,
    color: 'text-error-700',
    actionTypes: ['VAULT_PAUSED', 'VAULT_UNPAUSED', 'STRATEGY_DISABLED', 'STRATEGY_ENABLED', 'UNWIND_EXECUTED'],
  },
};

// Classify an event into a category
function classifyEvent(actionType: string): Category {
  for (const [cat, config] of Object.entries(CATEGORIES)) {
    if (cat === 'all') continue;
    if (config.actionTypes.some(t => actionType?.toUpperCase().includes(t) || t.includes(actionType?.toUpperCase()))) {
      return cat as Category;
    }
  }
  return 'admin'; // default fallback
}

// Direction indicator for fund movements
function flowDirection(actionType: string): 'inbound' | 'outbound' | 'internal' | null {
  const a = actionType?.toUpperCase() || '';
  if (a.includes('DEPOSIT') || a.includes('ONRAMP') || a.includes('INBOUND')) return 'inbound';
  if (a.includes('REDEMPTION') || a.includes('WITHDRAWAL') || a.includes('OFFRAMP') || a.includes('UNWIND')) return 'outbound';
  if (a.includes('ALLOCATION') || a.includes('LOCK') || a.includes('UNLOCK')) return 'internal';
  return null;
}

const flowBadge: Record<string, { bg: string; text: string; label: string }> = {
  inbound: { bg: 'bg-success-100', text: 'text-success-700', label: 'Inbound' },
  outbound: { bg: 'bg-warning-100', text: 'text-warning-700', label: 'Outbound' },
  internal: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Internal' },
};

// ─── Main Component ──────────────────────────────────────────────
export default function AuditLogPage() {
  const { notify } = useStore();
  const [events, setEvents] = useState<AuditEntry[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [category, setCategory] = useState<Category>('all');
  const [vaultFilter, setVaultFilter] = useState('ALL');
  const [resultFilter, setResultFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [evts, vaultList] = await Promise.all([
        api.getEvents(),
        api.getVaults(),
      ]);
      setEvents(evts);
      setVaults(vaultList);
    } catch {
      notify('error', 'Failed to load audit data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ─── Filtering & sorting ────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...events];

    // Category filter
    if (category !== 'all') {
      const catTypes = CATEGORIES[category].actionTypes;
      result = result.filter(e =>
        catTypes.some(t => e.actionType?.toUpperCase().includes(t) || t.includes(e.actionType?.toUpperCase())),
      );
    }

    // Vault filter
    if (vaultFilter !== 'ALL') {
      result = result.filter(e => e.vaultId === vaultFilter);
    }

    // Result filter
    if (resultFilter !== 'ALL') {
      result = result.filter(e => e.result?.toLowerCase() === resultFilter.toLowerCase());
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.actionType?.toLowerCase().includes(q) ||
        e.actor?.toLowerCase().includes(q) ||
        e.role?.toLowerCase().includes(q) ||
        e.reason?.toLowerCase().includes(q) ||
        e.vaultId?.toLowerCase().includes(q) ||
        e.eventId?.toLowerCase().includes(q) ||
        e.txSignature?.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sortDesc ? tb - ta : ta - tb;
    });

    return result;
  }, [events, category, vaultFilter, resultFilter, searchQuery, sortDesc]);

  // ─── Category counts ────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = { all: events.length, admin: 0, client_funds: 0, portfolio: 0, compliance: 0, emergency: 0 };
    for (const e of events) {
      const cat = classifyEvent(e.actionType);
      counts[cat]++;
    }
    return counts;
  }, [events]);

  // ─── Stats ──────────────────────────────────────────────────
  const totalInbound = events
    .filter(e => flowDirection(e.actionType) === 'inbound' && e.result === 'success')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalOutbound = events
    .filter(e => flowDirection(e.actionType) === 'outbound' && e.result === 'success')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const blockedCount = events.filter(e => e.result === 'failure').length;
  const pendingCount = events.filter(e => e.result === 'pending').length;

  // ─── CSV Export ─────────────────────────────────────────────
  const handleExport = () => {
    const headers = ['Timestamp', 'Event', 'Category', 'Flow', 'Vault', 'Actor', 'Role', 'Amount', 'Asset', 'Result', 'Reason', 'Tx Signature', 'On-Chain Address'];
    const rows = filtered.map(e => [
      e.timestamp,
      e.actionType,
      classifyEvent(e.actionType),
      flowDirection(e.actionType) || '',
      e.vaultId || '',
      e.actor || '',
      e.role || '',
      e.amount?.toString() || '',
      e.asset || '',
      e.result,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
      e.txSignature || '',
      e.onChainAddress || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AMINA-Audit-Log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', `Exported ${filtered.length} events`);
  };

  const uniqueVaults = [...new Set(events.map(e => e.vaultId).filter(Boolean))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-teal-700/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Master Audit Log</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete record of all administration, client, and portfolio activity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-teal-700 text-slate-700 hover:text-ink-900 text-xs font-medium rounded-md px-3 py-2 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Events</p>
          <p className="text-xl font-bold text-ink-900 font-mono">{events.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Inbound</p>
          <p className="text-xl font-bold text-success-700 font-mono">{fmt(totalInbound)}</p>
          <p className="text-[10px] text-slate-500">Deposits + On-Ramps</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Outbound</p>
          <p className="text-xl font-bold text-warning-700 font-mono">{fmt(totalOutbound)}</p>
          <p className="text-[10px] text-slate-500">Withdrawals + Off-Ramps</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Blocked</p>
          <p className="text-xl font-bold text-error-700 font-mono">{blockedCount}</p>
          <p className="text-[10px] text-slate-500">Policy violations</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Pending</p>
          <p className="text-xl font-bold text-warning-700 font-mono">{pendingCount}</p>
          <p className="text-[10px] text-slate-500">Awaiting action</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(Object.entries(CATEGORIES) as [Category, CategoryConfig][]).map(([key, config]) => {
          const Icon = config.icon;
          const isActive = category === key;
          return (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-all ease-amina duration-150 ${
                isActive
                  ? 'bg-teal-50 border-teal-700 text-teal-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-ink-900 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {config.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {categoryCounts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters Row */}
      <Card title={`Audit Trail — ${filtered.length} events`} subtitle={category === 'all' ? 'Showing all activity' : `Filtered by: ${CATEGORIES[category].label}`}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search events, actors, reasons, tx..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-ink-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors"
            />
          </div>

          {/* Vault filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-slate-400" />
            <select value={vaultFilter} onChange={e => setVaultFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600">
              <option value="ALL">All Vaults</option>
              {uniqueVaults.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Result filter */}
          <select value={resultFilter} onChange={e => setResultFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600">
            <option value="ALL">All Results</option>
            <option value="success">Success</option>
            <option value="failure">Failed / Blocked</option>
            <option value="pending">Pending</option>
          </select>

          {/* Sort toggle */}
          <button onClick={() => setSortDesc(!sortDesc)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-ink-900 border border-slate-200 rounded-md px-2 py-1.5 transition-colors">
            {sortDesc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            {sortDesc ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse py-8 text-center">Loading audit log...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No events match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-2 font-semibold w-[140px]">Timestamp</th>
                  <th className="text-left py-2 pr-2 font-semibold">Event</th>
                  <th className="text-left py-2 pr-2 font-semibold">Category</th>
                  <th className="text-left py-2 pr-2 font-semibold">Flow</th>
                  <th className="text-left py-2 pr-2 font-semibold">Vault</th>
                  <th className="text-left py-2 pr-2 font-semibold">Actor</th>
                  <th className="text-right py-2 pr-2 font-semibold">Amount</th>
                  <th className="text-left py-2 pr-2 font-semibold">Result</th>
                  <th className="text-left py-2 pr-2 font-semibold">On-Chain</th>
                  <th className="text-left py-2 font-semibold w-5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt) => {
                  const cat = classifyEvent(evt.actionType);
                  const catConfig = CATEGORIES[cat];
                  const flow = flowDirection(evt.actionType);
                  const flowConf = flow ? flowBadge[flow] : null;
                  const isExpanded = expandedRow === evt.eventId;

                  return (
                    <tr key={evt.eventId} className="border-b border-slate-200/30 hover:bg-teal-50/50 transition-colors align-top">
                      <td className="py-2.5 pr-2 text-slate-500 whitespace-nowrap">{fmtTime(evt.timestamp)}</td>
                      <td className="py-2.5 pr-2">
                        <span className="bg-teal-50 text-ink-900 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
                          {evt.actionType?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className={`text-[10px] font-medium ${catConfig.color}`}>
                          {catConfig.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        {flowConf ? (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${flowConf.bg} ${flowConf.text}`}>
                            {flowConf.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 font-mono text-ink-900 text-[10px]">{evt.vaultId || '—'}</td>
                      <td className="py-2.5 pr-2">
                        <span className="text-slate-500 capitalize">{evt.role?.replace(/_/g, ' ') || '—'}</span>
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono">
                        {evt.amount != null && evt.amount > 0 ? (
                          <span className={flow === 'outbound' ? 'text-warning-700' : flow === 'inbound' ? 'text-success-700' : 'text-ink-900'}>
                            {flow === 'outbound' ? '-' : flow === 'inbound' ? '+' : ''}{fmt(evt.amount)}
                            {evt.asset && <span className="text-slate-500 ml-1">{evt.asset}</span>}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2"><StatusBadge status={evt.result} /></td>
                      <td className="py-2.5 pr-2">
                        {evt.txSignature ? (
                          <a href={`https://solscan.io/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-[10px] text-teal-700 hover:underline whitespace-nowrap">
                            Tx <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : evt.onChainAddress ? (
                          <a href={`https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-[10px] text-review-700 hover:underline whitespace-nowrap">
                            PDA <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <button onClick={() => setExpandedRow(isExpanded ? null : evt.eventId)}
                          className="text-slate-400 hover:text-ink-900 transition-colors">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      {/* Expandable detail row rendered via CSS trick — using a second tr */}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expanded detail panels rendered below table rows */}
            {expandedRow && (() => {
              const evt = filtered.find(e => e.eventId === expandedRow);
              if (!evt) return null;
              const vault = vaults.find((v: any) => v.vaultId === evt.vaultId);
              return (
                <div className="bg-slate-100 rounded-md p-4 mt-1 mb-3 space-y-2 text-xs border border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Event Detail</p>
                    <button onClick={() => setExpandedRow(null)} className="text-slate-400 hover:text-ink-900">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      ['Event ID', evt.eventId],
                      ['Timestamp', fmtTime(evt.timestamp)],
                      ['Action', evt.actionType?.replace(/_/g, ' ')],
                      ['Actor', evt.actor || '—'],
                      ['Role', evt.role?.replace(/_/g, ' ') || '—'],
                      ['Vault', evt.vaultId || '—'],
                      ['Client', vault?.clientReference || evt.clientReference || '—'],
                      ['Amount', evt.amount ? `${fmt(evt.amount)} ${evt.asset || 'USDC'}` : '—'],
                      ['Strategy', evt.strategy || '—'],
                      ['Result', evt.result],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] text-slate-500">{label}</p>
                        <p className="text-ink-900 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                  {evt.reason && (
                    <div>
                      <p className="text-[10px] text-slate-500">Reason / Notes</p>
                      <p className="text-ink-900">{evt.reason}</p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-1">
                    {evt.txSignature && (
                      <a href={`https://solscan.io/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-teal-700 hover:underline bg-teal-700/10 px-2.5 py-1 rounded-md">
                        <ExternalLink className="w-2.5 h-2.5" /> View Transaction on Solana
                      </a>
                    )}
                    {evt.onChainAddress && (
                      <a href={`https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-review-700 hover:underline bg-review-700/10 px-2.5 py-1 rounded-md">
                        <ExternalLink className="w-2.5 h-2.5" /> View Account on Solana
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}
