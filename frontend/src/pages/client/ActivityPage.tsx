import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';

interface VaultEvent {
  eventId: string;
  actionType: string;
  actor: string;
  role: string;
  result: string;
  reason: string;
  timestamp: string;
  createdAt: string;
}

const ACTION_TYPES = [
  'all',
  'deposit',
  'redeem',
  'allocate',
  'unwind',
  'pause',
  'consent_request',
  'consent_approve',
  'credential_issue',
  'credential_revoke',
];

function getRowBorderColor(result: string): string {
  const r = result?.toLowerCase();
  if (r === 'success' || r === 'approved') return 'border-l-green-500';
  if (r === 'failure' || r === 'failed' || r === 'rejected' || r === 'blocked') return 'border-l-red-500';
  if (r === 'pending') return 'border-l-yellow-500';
  return 'border-l-vault-border';
}

function getResultColor(result: string): string {
  const r = result?.toLowerCase();
  if (r === 'success' || r === 'approved') return 'text-green-400';
  if (r === 'failure' || r === 'failed' || r === 'rejected' || r === 'blocked') return 'text-red-400';
  if (r === 'pending') return 'text-yellow-400';
  return 'text-vault-muted';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

import NotVerified from '../../components/NotVerified';

export default function ActivityPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(false);
  const [filterAction, setFilterAction] = useState('all');

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
    if (activeVaultId) loadEvents();
  }, [activeVaultId]);

  async function loadEvents() {
    setLoading(true);
    try {
      const data = await api.getEvents(activeVaultId!);
      setEvents(data);
    } catch {
      notify('error', 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-vault-muted text-sm">
            No vault selected. Your vault will be loaded automatically.
          </p>
          {autoLoading && (
            <p className="text-vault-muted text-xs mt-2 animate-pulse">Loading vaults...</p>
          )}
        </div>
      </div>
    );
  }

  const filteredEvents =
    filterAction === 'all'
      ? events
      : events.filter((e) => e.actionType === filterAction);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Activity Log</h1>
        <p className="text-sm text-vault-muted mt-1">
          Complete audit trail of vault operations
        </p>
      </div>

      <Card
        title="Transaction History"
        subtitle={`Showing ${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`}
      >
        {/* Filter */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-vault-muted">Filter by action:</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-1.5 rounded bg-vault-bg border border-vault-border text-white text-xs focus:outline-none focus:border-blue-500 transition-colors"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Actions' : t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-xs text-vault-muted animate-pulse">Loading activity log...</p>
        ) : filteredEvents.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-vault-muted">No events found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-vault-muted border-b border-vault-border">
                  <th className="text-left py-2 pr-3 font-medium">Timestamp</th>
                  <th className="text-left py-2 pr-3 font-medium">Event ID</th>
                  <th className="text-left py-2 pr-3 font-medium">Action</th>
                  <th className="text-left py-2 pr-3 font-medium">Actor</th>
                  <th className="text-left py-2 pr-3 font-medium">Role</th>
                  <th className="text-left py-2 pr-3 font-medium">Result</th>
                  <th className="text-left py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt) => (
                  <tr
                    key={evt.eventId}
                    className={`border-b border-vault-border/50 border-l-2 ${getRowBorderColor(evt.result)} hover:bg-white/[0.02]`}
                  >
                    <td className="py-2.5 pr-3 text-vault-muted whitespace-nowrap">
                      {formatTimestamp(evt.timestamp ?? evt.createdAt)}
                    </td>
                    <td className="py-2.5 pr-3 text-white font-mono">
                      {evt.eventId.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 pr-3 text-white capitalize">
                      {evt.actionType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 pr-3 text-vault-muted font-mono">
                      {evt.actor?.slice(0, 12)}...
                    </td>
                    <td className="py-2.5 pr-3 text-vault-muted capitalize">
                      {evt.role?.replace(/_/g, ' ') ?? '-'}
                    </td>
                    <td className={`py-2.5 pr-3 font-semibold capitalize ${getResultColor(evt.result)}`}>
                      {evt.result ?? '-'}
                    </td>
                    <td className="py-2.5 text-vault-muted max-w-[200px] truncate">
                      {evt.reason || '-'}
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
