import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import NotVerified from '../../components/NotVerified';
import { ExternalLink, RefreshCw } from 'lucide-react';

interface VaultEvent {
  eventId: string;
  vaultId?: string;
  actionType: string;
  actor: string;
  role: string;
  asset?: string;
  amount?: number;
  result: string;
  reason: string;
  timestamp: string;
  createdAt: string;
  txSignature?: string;
  onChainAddress?: string;
}

const ACTION_FILTERS = [
  { value: 'ALL', label: 'All Events' },
  { value: 'ONRAMP_COMPLETED', label: 'On-Ramp' },
  { value: 'OFFRAMP_REQUESTED', label: 'Off-Ramp' },
  { value: 'DEPOSIT_RECORDED', label: 'Deposits' },
  { value: 'WITHDRAWAL_REQUESTED', label: 'Withdrawals' },
  { value: 'REDEMPTION_EXECUTED', label: 'Redemptions' },
  { value: 'ALLOCATION_EXECUTED', label: 'Allocations' },
  { value: 'VAULT_CREATED', label: 'Vault Created' },
  { value: 'CREDENTIAL_ISSUED', label: 'Credentials' },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function resultBadge(result: string) {
  const r = result?.toLowerCase();
  if (r === 'success' || r === 'approved')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success-100 text-success-700">Success</span>;
  if (r === 'failure' || r === 'failed' || r === 'rejected' || r === 'blocked')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-error-100 text-error-700">Failed</span>;
  if (r === 'pending')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning-100 text-warning-700">Pending</span>;
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">{result}</span>;
}

function actionLabel(actionType: string): string {
  return (actionType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const truncate = (s: string, len = 14) => s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

export default function ActivityPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('ALL');

  const loadData = async () => {
    setLoading(true);
    try {
      const wallet = clientInfo?.walletAddress;
      const [vaultData, allEvents] = await Promise.all([
        wallet ? api.getVaultsByWallet(wallet) : api.getVaults(),
        api.getEvents(),
      ]);
      setVaults(vaultData);

      // Enrich deposit events with tx sigs from deposit records
      const depositTxLookup: Record<string, string> = {};
      await Promise.all(vaultData.map(async (v: any) => {
        try {
          const deps = await api.getDeposits(v.vaultId);
          for (const dep of deps) {
            if (dep.sourceType === 'On-Chain USDC Transfer' && dep.sourceReference) {
              depositTxLookup[`${v.vaultId}:${dep.amount}`] = dep.sourceReference;
            }
          }
        } catch { /* ignore */ }
      }));

      const userVaultIds = new Set(vaultData.map((v: any) => v.vaultId));
      const userEvents = allEvents
        .filter((e: VaultEvent) => !e.vaultId || userVaultIds.has(e.vaultId))
        .map((e: VaultEvent) => {
          if (e.actionType === 'DEPOSIT_RECORDED' && !e.txSignature && e.vaultId && e.amount) {
            const txSig = depositTxLookup[`${e.vaultId}:${e.amount}`];
            if (txSig) return { ...e, txSignature: txSig };
          }
          return e;
        });
      setEvents(userEvents);

      if (!activeVaultId && vaultData.length > 0) {
        setActiveVaultId(vaultData[0].vaultId);
      }
    } catch {
      notify('error', 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = filterAction === 'ALL' ? events : events.filter(e => e.actionType === filterAction);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display text-ink-900">Activity Log</h1>
          <p className="text-sm text-slate-500 mt-1">Complete audit trail of vault operations</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <Card title="Transaction History" subtitle={`${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-1.5 rounded-[12px] bg-white border border-slate-200 text-ink-900 text-xs focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 transition-colors">
            {ACTION_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse py-4">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No events found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Date</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Action</th>
                  <th className="text-right py-2.5 pr-3 font-semibold border-b border-slate-200">Amount</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Status</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Explorer</th>
                  <th className="text-left py-2.5 font-semibold border-b border-slate-200">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt, i) => (
                  <tr key={evt.eventId} className={`hover:bg-teal-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-200/60' : ''}`}>
                    <td className="py-3 pr-3 text-slate-500 whitespace-nowrap align-top">
                      {formatTimestamp(evt.timestamp ?? evt.createdAt)}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <span className="text-ink-900 font-medium">{actionLabel(evt.actionType)}</span>
                      {evt.vaultId && vaults.length > 1 && (
                        <span className="text-slate-500 font-mono ml-1.5">{evt.vaultId}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono align-top">
                      {evt.amount != null && evt.amount > 0 ? (
                        <span className={evt.actionType?.includes('REDEMPTION') ? 'text-warning-700' : 'text-ink-900'}>
                          {evt.actionType?.includes('REDEMPTION') ? '-' : '+'}{fmt(evt.amount)}
                          {evt.asset ? <span className="text-slate-500 ml-1">{evt.asset}</span> : null}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {resultBadge(evt.result)}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {evt.txSignature ? (
                        <a href={`https://solscan.io/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:underline font-mono">
                          Tx {truncate(evt.txSignature)} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      ) : evt.onChainAddress && (evt.actionType === 'VAULT_CREATED' || evt.actionType === 'CREDENTIAL_ISSUED') ? (
                        <a href={`https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-review-700 hover:underline font-mono">
                          Acc {truncate(evt.onChainAddress)} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      ) : null}
                    </td>
                    <td className="py-3 text-slate-500 max-w-[240px] align-top">
                      <span className="line-clamp-2">{evt.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
