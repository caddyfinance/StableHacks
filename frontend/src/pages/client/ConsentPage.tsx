import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ConsentRequest {
  requestId: string;
  vaultId: string;
  actionType: string;
  amount: number;
  status: string;
  initiator: string;
  details?: { strategyId?: string; strategyName?: string; destinationWallet?: string };
  createdAt: string;
  consentedAt?: string;
}

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConsentPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [mandate, setMandate] = useState<any>(null);

  // Auto-select vault
  useEffect(() => {
    if (!activeVaultId) {
      api.getVaults().then((vaults) => {
        if (vaults.length > 0) setActiveVaultId(vaults[0].vaultId ?? vaults[0].id);
      }).catch(() => {});
    }
  }, [activeVaultId, setActiveVaultId]);

  useEffect(() => {
    if (activeVaultId) loadData();
  }, [activeVaultId]);

  async function loadData() {
    setLoading(true);
    try {
      const [data, mand] = await Promise.all([
        api.getConsentRequests(),
        api.getMandate(activeVaultId!).catch(() => null),
      ]);
      setRequests(data.filter((r: ConsentRequest) => r.vaultId === activeVaultId));
      setMandate(mand);
    } catch {
      notify('error', 'Failed to load consent requests');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    setApprovingId(requestId);
    try {
      await api.approveConsent(requestId);
      notify('success', `Transaction approved`);
      setRequests((prev) => prev.map((r) => r.requestId === requestId ? { ...r, status: 'approved', consentedAt: new Date().toISOString() } : r));
    } catch {
      notify('error', 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  }

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm animate-pulse">Loading your vault...</p>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status.toLowerCase() === 'pending');
  const resolvedRequests = requests.filter((r) => r.status.toLowerCase() !== 'pending');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-teal-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display text-ink-900">Transaction Approvals</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Approve or review transactions requested by the portfolio manager that exceed your consent threshold
          </p>
        </div>
      </div>

      {/* Consent threshold info */}
      {mandate && (
        <div className="bg-teal-50 border border-teal-300/30 rounded-lg p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-teal-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-ink-900 font-medium">
              Your consent threshold is {fmt(mandate.consentThreshold)} USDC
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Any allocation or transaction above this amount requires your explicit approval before it can be executed by the portfolio manager.
            </p>
          </div>
        </div>
      )}

      {/* Pending Alert */}
      {pendingRequests.length > 0 && (
        <div className="bg-warning-100 border border-warning-700/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-700" />
            <div>
              <p className="text-sm font-medium text-warning-700">
                {pendingRequests.length} transaction{pendingRequests.length !== 1 ? 's' : ''} awaiting your approval
              </p>
              <p className="text-[10px] text-warning-700/80">
                The portfolio manager has requested to execute transactions that exceed your consent threshold
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Requests */}
      <Card title="Pending Approvals" subtitle="Transactions requested by the portfolio manager requiring your consent">
        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse">Loading...</p>
        ) : pendingRequests.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle className="w-8 h-8 text-success-700 mx-auto mb-2" />
            <p className="text-sm text-ink-900 font-medium">No pending approvals</p>
            <p className="text-xs text-slate-500 mt-1">
              All portfolio manager actions are within your delegated authority limits
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div key={req.requestId} className="bg-white border border-warning-700/20 rounded-lg p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning-700" />
                    <span className="text-xs font-medium text-warning-700">Approval Required</span>
                  </div>
                  <StatusBadge status="pending" size="md" />
                </div>

                {/* Details */}
                <div className="bg-slate-100 rounded-md p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Request</span>
                    <span className="text-ink-900 font-mono">{req.requestId}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Action</span>
                    <span className="text-ink-900 font-medium capitalize">{req.actionType.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Amount</span>
                    <span className="text-ink-900 font-mono font-semibold">{fmt(req.amount)} USDC</span>
                  </div>
                  {(req.details as any)?.strategyName && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Strategy</span>
                      <span className="text-ink-900">{(req.details as any).strategyName}</span>
                    </div>
                  )}
                  {(req.details as any)?.destinationWallet && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Destination</span>
                      <span className="text-ink-900 font-mono">{(req.details as any).destinationWallet}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Requested by</span>
                    <span className="text-ink-900">Portfolio Manager</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Requested at</span>
                    <span className="text-slate-500">{formatDate(req.createdAt)}</span>
                  </div>
                  {mandate && (
                    <div className="flex justify-between text-xs border-t border-slate-200 pt-2">
                      <span className="text-slate-500">Consent threshold</span>
                      <span className="text-warning-700 font-mono">{fmt(mandate.consentThreshold)} USDC</span>
                    </div>
                  )}
                </div>

                {/* Why this needs approval */}
                <div className="bg-warning-100 rounded-md px-3 py-2">
                  <p className="text-[10px] text-warning-700">
                    This transaction of {fmt(req.amount)} USDC exceeds your consent threshold{mandate ? ` of ${fmt(mandate.consentThreshold)} USDC` : ''}.
                    By approving, you authorise the portfolio manager to execute this transaction on your vault.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleApprove(req.requestId)}
                    disabled={approvingId === req.requestId}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-success-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-[12px] transition-colors disabled:opacity-50 shadow-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {approvingId === req.requestId ? 'Approving...' : 'Approve Transaction'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Resolved Requests */}
      {resolvedRequests.length > 0 && (
        <Card title="Resolved" subtitle="Previously approved or processed transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-semibold">Request</th>
                  <th className="text-left py-2 pr-3 font-semibold">Action</th>
                  <th className="text-right py-2 pr-3 font-semibold">Amount</th>
                  <th className="text-left py-2 pr-3 font-semibold">Date</th>
                  <th className="text-left py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {resolvedRequests.map((req) => (
                  <tr key={req.requestId} className="border-b border-slate-200/50 hover:bg-teal-50">
                    <td className="py-2.5 pr-3 text-ink-900 font-mono">{req.requestId}</td>
                    <td className="py-2.5 pr-3 text-slate-500 capitalize">{req.actionType.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 pr-3 text-ink-900 text-right font-mono">{fmt(req.amount)}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{formatDate(req.consentedAt || req.createdAt)}</td>
                    <td className="py-2.5"><StatusBadge status={req.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
