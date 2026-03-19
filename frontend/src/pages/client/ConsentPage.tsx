import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';

interface ConsentRequest {
  requestId: string;
  vaultId: string;
  actionType: string;
  amount: number;
  status: string;
  initiator: string;
  createdAt: string;
}

import NotVerified from '../../components/NotVerified';

export default function ConsentPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;
  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Auto-select vault if none active
  useEffect(() => {
    if (!activeVaultId) {
      setAutoLoading(true);
      api.getVaults()
        .then((vaults) => {
          if (vaults.length > 0) {
            setActiveVaultId(vaults[0].vaultId ?? vaults[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setAutoLoading(false));
    }
  }, [activeVaultId, setActiveVaultId]);

  useEffect(() => {
    if (activeVaultId) loadRequests();
  }, [activeVaultId]);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await api.getConsentRequests();
      setRequests(data.filter((r: ConsentRequest) => r.vaultId === activeVaultId));
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
      notify('success', `Consent request ${requestId.slice(0, 8)}... approved`);
      setRequests((prev) =>
        prev.map((r) =>
          r.requestId === requestId ? { ...r, status: 'approved' } : r
        )
      );
    } catch {
      notify('error', `Failed to approve request ${requestId.slice(0, 8)}...`);
    } finally {
      setApprovingId(null);
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-500 text-sm">
            No vault selected. Your vault will be loaded automatically.
          </p>
          {autoLoading && (
            <p className="text-slate-500 text-xs mt-2 animate-pulse">Loading vaults...</p>
          )}
        </div>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status.toLowerCase() === 'pending');
  const approvedRequests = requests.filter((r) => r.status.toLowerCase() === 'approved');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display text-ink-900">Consent Management</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review and approve operations that exceed delegated authority
        </p>
      </div>

      {/* Pending Consent Requests */}
      <Card title="Pending Requests" subtitle="Actions awaiting your approval">
        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse">Loading consent requests...</p>
        ) : pendingRequests.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-500">
              No pending consent requests.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              All actions within delegated authority.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-medium">Request ID</th>
                  <th className="text-left py-2 pr-3 font-medium">Action Type</th>
                  <th className="text-right py-2 pr-3 font-medium">Amount</th>
                  <th className="text-left py-2 pr-3 font-medium">Initiator</th>
                  <th className="text-left py-2 pr-3 font-medium">Requested</th>
                  <th className="text-right py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((req) => (
                  <tr
                    key={req.requestId}
                    className="border-b border-slate-200/80 hover:bg-teal-50"
                  >
                    <td className="py-2.5 pr-3 text-ink-900 font-mono">
                      {req.requestId.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 capitalize">
                      {req.actionType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-900 text-right font-mono">
                      {req.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '-'}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 font-mono">
                      {req.initiator?.slice(0, 12)}...
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {formatDate(req.createdAt)}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => handleApprove(req.requestId)}
                        disabled={approvingId === req.requestId}
                        className="px-4 py-1.5 text-[10px] font-semibold rounded-[12px] bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-1"
                      >
                        {approvingId === req.requestId ? 'Approving...' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recently Approved */}
      <Card title="Recently Approved" subtitle="Consent requests that have been approved">
        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse">Loading...</p>
        ) : approvedRequests.length === 0 ? (
          <p className="text-xs text-slate-500">No recently approved requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-medium">Request ID</th>
                  <th className="text-left py-2 pr-3 font-medium">Action Type</th>
                  <th className="text-right py-2 pr-3 font-medium">Amount</th>
                  <th className="text-left py-2 pr-3 font-medium">Initiator</th>
                  <th className="text-left py-2 pr-3 font-medium">Requested</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {approvedRequests.map((req) => (
                  <tr
                    key={req.requestId}
                    className="border-b border-slate-200/80 hover:bg-teal-50"
                  >
                    <td className="py-2.5 pr-3 text-ink-900 font-mono">
                      {req.requestId.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 capitalize">
                      {req.actionType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 pr-3 text-ink-900 text-right font-mono">
                      {req.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '-'}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500 font-mono">
                      {req.initiator?.slice(0, 12)}...
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">
                      {formatDate(req.createdAt)}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status="approved" />
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
