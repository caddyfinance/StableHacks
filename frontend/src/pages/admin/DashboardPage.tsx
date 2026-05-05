import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore, ROLE_LABELS, Role, Segment } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import {
  Shield, Building2, TrendingUp, ClipboardCheck, ArrowRight, Wallet,
  AlertTriangle, ShieldCheck, Pause, Play, Activity, FileCheck,
  ArrowDownToLine, ArrowUpFromLine, Eye, Banknote, UserCheck,
} from 'lucide-react';

// ─── Shared data loader ──────────────────────────────────────────
function useDashboardData() {
  const { activeVaultId, setActiveVaultId, notify } = useStore();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [creds, vaultList, evts, strats] = await Promise.all([
        api.getCredentials().catch(() => []),
        api.getVaults().catch(() => []),
        api.getEvents().catch(() => []),
        api.getStrategies().catch(() => []),
      ]);
      setCredentials(creds);
      setVaults(vaultList);
      setEvents(evts);
      setStrategies(strats);
      if (!activeVaultId && vaultList.length > 0) {
        setActiveVaultId(vaultList[0].vaultId);
      }
      // Load snapshots for active vaults
      const snaps: Record<string, any> = {};
      await Promise.all(
        vaultList.slice(0, 5).map(async (v: any) => {
          try {
            snaps[v.vaultId] = await api.getSnapshot(v.vaultId);
          } catch { /* skip */ }
        }),
      );
      setSnapshots(snaps);
    } catch {
      notify('error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [activeVaultId, setActiveVaultId, notify]);

  useEffect(() => { load(); }, []);

  return { loading, credentials, vaults, events, strategies, snapshots, activeVaultId };
}

const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── BANK ADMIN DASHBOARD ────────────────────────────────────────
function AdminDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const navigate = useNavigate();
  const { credentials, vaults, events, strategies, activeVaultId } = data;

  const activeVaults = vaults.filter((v: any) => v.status === 'active');
  const totalNAV = vaults.reduce((s: number, v: any) => s + (v.totalNAV || 0), 0);
  const totalDeposited = vaults.reduce((s: number, v: any) => s + (v.totalDeposited || 0), 0);
  const activeCreds = credentials.filter((c: any) => c.status === 'active');
  const revokedCreds = credentials.filter((c: any) => c.status === 'revoked');
  const clientsWithActiveVaults = new Set(activeVaults.map((v: any) => v.clientReference).filter(Boolean)).size;

  const statCards = [
    { label: 'Credentials Issued', value: credentials.length, sub: `${activeCreds.length} active, ${revokedCreds.length} revoked`, icon: Shield, color: 'text-teal-700' },
    { label: 'Clients with Active Vaults', value: clientsWithActiveVaults, sub: `${activeVaults.length} vault${activeVaults.length !== 1 ? 's' : ''} — ${fmt(totalNAV)} USDC total NAV`, icon: Building2, color: 'text-teal-600' },
    { label: 'Total Deposited', value: fmt(totalDeposited), sub: 'Across all vaults', icon: Banknote, color: 'text-success-700' },
    { label: 'Compliance Events', value: events.length, sub: `${events.filter((e: any) => e.result === 'failure').length} blocked`, icon: ClipboardCheck, color: 'text-warning-700' },
  ];

  const quickActions = [
    { label: 'Issue Credential', desc: 'Approve new institutional client', path: '/amina/credentials', icon: Shield },
    { label: 'Create Vault', desc: 'Deploy segregated vault for client', path: '/amina/vault-factory', icon: Building2 },
    { label: 'Configure Mandate', desc: 'Set strategy limits and controls', path: '/amina/mandate', icon: FileCheck },
    { label: 'Fund Vault', desc: 'Deposit with provenance tracking', path: '/amina/funding', icon: Wallet },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
            <div className="flex items-center justify-between mb-2">
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-ink-900 font-mono">{value}</p>
            <p className="text-xs text-slate-700 mt-1">{label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Vault Overview Table */}
      {vaults.length > 0 && (
        <Card title="Vault Overview" subtitle={`${vaults.length} provisioned vault${vaults.length !== 1 ? 's' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-semibold">Vault ID</th>
                  <th className="text-left py-2 pr-3 font-semibold">Client</th>
                  <th className="text-left py-2 pr-3 font-semibold">Status</th>
                  <th className="text-right py-2 pr-3 font-semibold">NAV</th>
                  <th className="text-right py-2 pr-3 font-semibold">Idle</th>
                  <th className="text-left py-2 font-semibold">Tags</th>
                </tr>
              </thead>
              <tbody>
                {vaults.map((v: any) => (
                  <tr key={v.vaultId} className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors cursor-pointer" onClick={() => navigate('/amina/funding')}>
                    <td className="py-2.5 pr-3 font-mono text-ink-900">{v.vaultId}</td>
                    <td className="py-2.5 pr-3 text-ink-900">{v.clientReference || '—'}</td>
                    <td className="py-2.5 pr-3"><StatusBadge status={v.status} /></td>
                    <td className="py-2.5 pr-3 text-right font-mono text-ink-900">{fmt(v.totalNAV)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-slate-500">{fmt(v.idleBalance)}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">Segregated</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-success-100 text-success-700 rounded font-medium">Non-Pooled</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card title="Quick Actions" subtitle="Common administration tasks">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map(({ label, desc, path, icon: Icon }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="bg-white border border-slate-200 rounded-md p-4 text-left hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200 group"
            >
              <div className="w-9 h-9 rounded-md bg-teal-100 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-teal-700" />
              </div>
              <p className="text-sm font-medium text-ink-900">{label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Recent Credentials */}
      {credentials.length > 0 && (
        <Card title="Recent Credentials" subtitle={`${credentials.length} issued`}>
          <div className="space-y-2">
            {credentials.slice(0, 5).map((c: any) => (
              <div key={c.credentialId} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-2">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-teal-700" />
                  <div>
                    <p className="text-xs text-ink-900 font-medium">{c.clientReference}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{c.credentialId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">{c.jurisdiction}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

// ─── PORTFOLIO MANAGER DASHBOARD ─────────────────────────────────
function PortfolioManagerDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const navigate = useNavigate();
  const { vaults, strategies, snapshots, events } = data;
  // Get unique clients from vaults
  const clients = [...new Set(vaults.map((v: any) => v.clientReference).filter(Boolean))];
  const [selectedClient, setSelectedClient] = useState<string>(clients[0] || '');

  // Auto-select first client when data loads
  useEffect(() => {
    if (!selectedClient && clients.length > 0) setSelectedClient(clients[0]);
  }, [clients.length]);

  // Filter vaults and events by selected client
  const filteredVaults = selectedClient ? vaults.filter((v: any) => v.clientReference === selectedClient) : vaults;
  const filteredVaultIds = new Set(filteredVaults.map((v: any) => v.vaultId));
  const filteredEvents = selectedClient ? events.filter((e: any) => !e.vaultId || filteredVaultIds.has(e.vaultId)) : events;

  const totalNAV = filteredVaults.reduce((s: number, v: any) => s + (v.totalNAV || 0), 0);
  const totalIdle = filteredVaults.reduce((s: number, v: any) => s + (v.idleBalance || 0), 0);
  const totalDeployed = totalNAV - totalIdle;
  const deployedPct = totalNAV > 0 ? (totalDeployed / totalNAV * 100) : 0;

  const activeStrategies = strategies.filter((s: any) => !s.disabled);
  const allocationEvents = filteredEvents.filter((e: any) => e.actionType === 'ALLOCATION_EXECUTED');
  const blockedEvents = filteredEvents.filter((e: any) => e.actionType === 'ALLOCATION_BLOCKED');
  const consentEvents = filteredEvents.filter((e: any) => e.actionType === 'CONSENT_REQUESTED');

  const statCards = [
    { label: 'Total NAV', value: fmt(totalNAV), sub: selectedClient ? `Client: ${selectedClient}` : 'No client selected', icon: Banknote, color: 'text-teal-700' },
    { label: 'Deployed', value: fmt(totalDeployed), sub: `${deployedPct.toFixed(1)}% of NAV`, icon: TrendingUp, color: 'text-success-700' },
    { label: 'Idle Capital', value: fmt(totalIdle), sub: 'Available for deployment', icon: Wallet, color: 'text-warning-700' },
    { label: 'Active Strategies', value: activeStrategies.length, sub: `${strategies.length} total configured`, icon: Activity, color: 'text-teal-600' },
  ];

  return (
    <>
      {/* Client Selector */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4 shadow-1">
        <div className="flex items-center gap-3">
          <UserCheck className="w-5 h-5 text-teal-700" />
          <div>
            <p className="text-xs text-slate-500">Viewing portfolio for</p>
            <p className="text-sm font-medium text-ink-900">{selectedClient === 'ALL' ? 'All Clients' : selectedClient}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clients.map((client) => (
            <button
              key={client}
              onClick={() => setSelectedClient(client)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ease-amina duration-150 ${
                selectedClient === client
                  ? 'bg-teal-50 border-teal-700 text-teal-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-ink-900'
              }`}
            >
              {client}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
            <Icon size={20} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-ink-900 font-mono">{value}</p>
            <p className="text-xs text-slate-700 mt-1">{label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Capital Allocation Bar */}
      <Card title="Capital Allocation" subtitle={`Deployment for ${selectedClient || 'client'}`}>
        <div className="space-y-4">
          <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-teal-700 transition-all" style={{ width: `${deployedPct}%` }} title="Deployed" />
            <div className="h-full bg-slate-300 transition-all" style={{ width: `${100 - deployedPct}%` }} title="Idle" />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Deployed: <span className="text-ink-900 font-mono font-medium">{fmt(totalDeployed)}</span> ({deployedPct.toFixed(1)}%)</span>
            <span>Idle: <span className="text-ink-900 font-mono font-medium">{fmt(totalIdle)}</span> ({(100 - deployedPct).toFixed(1)}%)</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Strategy Overview */}
        <Card title="Strategy Overview" subtitle={`${activeStrategies.length} active strategies`}>
          <div className="space-y-2">
            {strategies.map((s: any) => (
              <div key={s.strategyId} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-2.5">
                <div>
                  <p className="text-xs text-ink-900 font-medium">{s.name}</p>
                  <p className="text-[10px] text-slate-500">{s.riskLevel} risk — {s.currentYield || 0}% APY</p>
                </div>
                <StatusBadge status={s.disabled ? 'disabled' : 'active'} />
              </div>
            ))}
          </div>
        </Card>

        {/* Execution Activity */}
        <Card title="Execution Activity" subtitle={`Client: ${selectedClient || '—'}`}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-success-100 rounded-md p-3 text-center">
                <p className="text-lg font-bold text-success-700">{allocationEvents.length}</p>
                <p className="text-[10px] text-success-700">Executed</p>
              </div>
              <div className="bg-error-100 rounded-md p-3 text-center">
                <p className="text-lg font-bold text-error-700">{blockedEvents.length}</p>
                <p className="text-[10px] text-error-700">Blocked</p>
              </div>
              <div className="bg-warning-100 rounded-md p-3 text-center">
                <p className="text-lg font-bold text-warning-700">{consentEvents.length}</p>
                <p className="text-[10px] text-warning-700">Consent Pending</p>
              </div>
            </div>
            <button onClick={() => navigate('/amina/execution')}
              className="w-full flex items-center justify-center gap-2 text-xs text-teal-700 hover:text-teal-800 bg-teal-50 rounded-md py-2 transition-colors">
              <TrendingUp className="w-3.5 h-3.5" /> Open Execution Console <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>
      </div>

      {/* Per-Vault Positions */}
      {filteredVaults.length > 0 && (
        <Card title="Vault Positions" subtitle={`Vaults for ${selectedClient || 'client'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-semibold">Vault</th>
                  <th className="text-left py-2 pr-3 font-semibold">Client</th>
                  <th className="text-right py-2 pr-3 font-semibold">NAV</th>
                  <th className="text-right py-2 pr-3 font-semibold">Deployed</th>
                  <th className="text-right py-2 pr-3 font-semibold">Idle</th>
                  <th className="text-left py-2 font-semibold">Mandate</th>
                </tr>
              </thead>
              <tbody>
                {filteredVaults.map((v: any) => {
                  const snap = snapshots[v.vaultId];
                  const idle = v.idleBalance || 0;
                  const nav = v.totalNAV || 0;
                  return (
                    <tr key={v.vaultId} className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors cursor-pointer" onClick={() => navigate('/amina/execution')}>
                      <td className="py-2.5 pr-3 font-mono text-ink-900">{v.vaultId}</td>
                      <td className="py-2.5 pr-3 text-ink-900">{v.clientReference || '—'}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-ink-900">{fmt(nav)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-teal-700">{fmt(nav - idle)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-slate-500">{fmt(idle)}</td>
                      <td className="py-2.5"><StatusBadge status={snap?.mandateStatus || 'none'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── COMPLIANCE OFFICER DASHBOARD ────────────────────────────────
function ComplianceOfficerDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const navigate = useNavigate();
  const { vaults, events, snapshots, credentials } = data;

  const successEvents = events.filter((e: any) => e.result === 'success');
  const failedEvents = events.filter((e: any) => e.result === 'failure');
  const pendingEvents = events.filter((e: any) => e.result === 'pending');
  const recentEvents = events.slice(0, 10);

  const activeCreds = credentials.filter((c: any) => c.status === 'active');
  const pausedVaults = vaults.filter((v: any) => v.paused);

  const statCards = [
    { label: 'Total Events', value: events.length, sub: `${successEvents.length} passed, ${failedEvents.length} blocked`, icon: ClipboardCheck, color: 'text-teal-700' },
    { label: 'Pending Reviews', value: pendingEvents.length, sub: pendingEvents.length > 0 ? 'Require attention' : 'All clear', icon: Eye, color: pendingEvents.length > 0 ? 'text-warning-700' : 'text-success-700' },
    { label: 'Active Credentials', value: activeCreds.length, sub: `${credentials.length} total issued`, icon: Shield, color: 'text-teal-600' },
    { label: 'Vault Health', value: pausedVaults.length > 0 ? `${pausedVaults.length} paused` : 'All Active', sub: `${vaults.length} vault${vaults.length !== 1 ? 's' : ''} monitored`, icon: ShieldCheck, color: pausedVaults.length > 0 ? 'text-error-700' : 'text-success-700' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
            <Icon size={20} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-ink-900">{value}</p>
            <p className="text-xs text-slate-700 mt-1">{label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Pending Reviews Alert */}
      {pendingEvents.length > 0 && (
        <div className="bg-warning-100 border border-warning-700/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-700" />
            <div>
              <p className="text-sm font-medium text-warning-700">{pendingEvents.length} event{pendingEvents.length !== 1 ? 's' : ''} require review</p>
              <p className="text-[10px] text-warning-700/80">Pending consent or review actions detected in the audit trail</p>
            </div>
          </div>
          <button onClick={() => navigate('/amina/compliance')} className="px-4 py-2 bg-warning-700 text-white text-xs font-semibold rounded-md hover:bg-warning-700/90 transition-colors">
            Review Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Event Breakdown */}
        <Card title="Event Breakdown" subtitle="Audit trail summary by outcome">
          <div className="space-y-2">
            {[
              { label: 'Passed Controls', count: successEvents.length, color: 'bg-success-100 text-success-700' },
              { label: 'Blocked by Policy', count: failedEvents.length, color: 'bg-error-100 text-error-700' },
              { label: 'Pending Review', count: pendingEvents.length, color: 'bg-warning-100 text-warning-700' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-2.5">
                <span className="text-xs text-ink-900 font-medium">{label}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{count}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/amina/compliance')}
            className="w-full flex items-center justify-center gap-2 text-xs text-teal-700 hover:text-teal-800 bg-teal-50 rounded-md py-2 mt-3 transition-colors">
            <ClipboardCheck className="w-3.5 h-3.5" /> Full Compliance Centre <ArrowRight className="w-3 h-3" />
          </button>
        </Card>

        {/* Vault Compliance Status */}
        <Card title="Vault Compliance Status" subtitle="Per-vault governance state">
          <div className="space-y-2">
            {vaults.map((v: any) => {
              const snap = snapshots[v.vaultId];
              return (
                <div key={v.vaultId} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-2.5 cursor-pointer hover:bg-teal-50 transition-colors" onClick={() => navigate('/amina/compliance')}>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className={`w-4 h-4 ${v.paused ? 'text-error-700' : 'text-success-700'}`} />
                    <div>
                      <p className="text-xs text-ink-900 font-mono font-medium">{v.vaultId}</p>
                      <p className="text-[10px] text-slate-500">{v.clientReference || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={snap?.mandateStatus || 'none'} />
                    {v.paused && <span className="text-[9px] px-1.5 py-0.5 bg-error-100 text-error-700 rounded font-semibold">PAUSED</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent Audit Events */}
      <Card title="Recent Audit Events" subtitle={`Latest ${recentEvents.length} events`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 pr-3 font-semibold">Time</th>
                <th className="text-left py-2 pr-3 font-semibold">Event</th>
                <th className="text-left py-2 pr-3 font-semibold">Actor</th>
                <th className="text-left py-2 pr-3 font-semibold">Result</th>
                <th className="text-left py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((evt: any) => (
                <tr key={evt.eventId} className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{new Date(evt.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="py-2 pr-3">
                    <span className="bg-teal-50 text-ink-900 rounded px-1.5 py-0.5 text-[10px] font-medium">{evt.actionType?.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-500 capitalize">{evt.role?.replace(/_/g, ' ') || '—'}</td>
                  <td className="py-2 pr-3"><StatusBadge status={evt.result} /></td>
                  <td className="py-2 text-slate-500 max-w-[200px] truncate">{evt.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── EMERGENCY ADMIN DASHBOARD ───────────────────────────────────
function EmergencyAdminDashboard({ data }: { data: ReturnType<typeof useDashboardData> }) {
  const navigate = useNavigate();
  const { vaults, strategies, events, snapshots } = data;

  const pausedVaults = vaults.filter((v: any) => v.paused);
  const activeVaults = vaults.filter((v: any) => !v.paused && v.status === 'active');
  const disabledStrategies = strategies.filter((s: any) => s.disabled);
  const emergencyEvents = events.filter((e: any) =>
    ['VAULT_PAUSED', 'UNWIND_EXECUTED', 'ALLOCATION_BLOCKED'].includes(e.actionType),
  );
  const totalNAV = vaults.reduce((s: number, v: any) => s + (v.totalNAV || 0), 0);

  const statCards = [
    { label: 'System Status', value: pausedVaults.length > 0 ? 'ALERT' : 'NORMAL', sub: pausedVaults.length > 0 ? `${pausedVaults.length} vault${pausedVaults.length !== 1 ? 's' : ''} paused` : 'All systems operational', icon: AlertTriangle, color: pausedVaults.length > 0 ? 'text-error-700' : 'text-success-700' },
    { label: 'Active Vaults', value: activeVaults.length, sub: `${vaults.length} total, ${pausedVaults.length} paused`, icon: Building2, color: 'text-teal-700' },
    { label: 'Strategy Health', value: disabledStrategies.length > 0 ? `${disabledStrategies.length} disabled` : 'All Active', sub: `${strategies.length} configured`, icon: Activity, color: disabledStrategies.length > 0 ? 'text-warning-700' : 'text-success-700' },
    { label: 'Capital at Risk', value: fmt(totalNAV), sub: 'Total NAV across vaults', icon: Banknote, color: 'text-teal-600' },
  ];

  return (
    <>
      {/* Alert Banner */}
      {pausedVaults.length > 0 && (
        <div className="bg-error-100 border border-error-700/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-error-700" />
            <div>
              <p className="text-sm font-medium text-error-700">{pausedVaults.length} vault{pausedVaults.length !== 1 ? 's' : ''} currently paused</p>
              <p className="text-[10px] text-error-700/80">Paused vaults block all allocations and deposits</p>
            </div>
          </div>
          <button onClick={() => navigate('/amina/emergency')} className="px-4 py-2 bg-error-700 text-white text-xs font-semibold rounded-md hover:bg-error-700/90 transition-colors">
            Emergency Controls
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-5 shadow-1">
            <Icon size={20} className={`${color} mb-2`} />
            <p className="text-2xl font-bold text-ink-900">{value}</p>
            <p className="text-xs text-slate-700 mt-1">{label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Vault Status Panel */}
        <Card title="Vault Pause Status" subtitle="Real-time vault operational state">
          <div className="space-y-2">
            {vaults.map((v: any) => (
              <div key={v.vaultId} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-3 cursor-pointer hover:bg-teal-50 transition-colors" onClick={() => navigate('/amina/emergency')}>
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${v.paused ? 'bg-error-700 animate-pulse' : 'bg-success-700'}`} />
                  <div>
                    <p className="text-xs text-ink-900 font-mono font-medium">{v.vaultId}</p>
                    <p className="text-[10px] text-slate-500">{v.clientReference} — {fmt(v.totalNAV)} USDC</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {v.paused ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-error-700 bg-error-100 px-2 py-0.5 rounded">
                      <Pause className="w-3 h-3" /> PAUSED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-success-700 bg-success-100 px-2 py-0.5 rounded">
                      <Play className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Strategy Adapter Status */}
        <Card title="Strategy Adapter Status" subtitle="Enable/disable state of strategy adapters">
          <div className="space-y-2">
            {strategies.map((s: any) => (
              <div key={s.strategyId} className="flex items-center justify-between bg-slate-100 rounded-md px-3 py-2.5 cursor-pointer hover:bg-teal-50 transition-colors" onClick={() => navigate('/amina/emergency')}>
                <div>
                  <p className="text-xs text-ink-900 font-medium">{s.name}</p>
                  <p className="text-[10px] text-slate-500">{s.riskLevel} risk</p>
                </div>
                <StatusBadge status={s.disabled ? 'disabled' : 'active'} />
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/amina/emergency')}
            className="w-full flex items-center justify-center gap-2 text-xs text-teal-700 hover:text-teal-800 bg-teal-50 rounded-md py-2 mt-3 transition-colors">
            <AlertTriangle className="w-3.5 h-3.5" /> Emergency Controls <ArrowRight className="w-3 h-3" />
          </button>
        </Card>
      </div>

      {/* Emergency Event Log */}
      {emergencyEvents.length > 0 && (
        <Card title="Emergency Event Log" subtitle={`${emergencyEvents.length} emergency-related events`}>
          <div className="space-y-2">
            {emergencyEvents.slice(0, 8).map((evt: any) => (
              <div key={evt.eventId} className={`border-l-2 ${evt.result === 'success' ? 'border-l-success-700' : 'border-l-error-700'} bg-slate-100 rounded-r-md px-3 py-2`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-900 font-medium">{evt.actionType?.replace(/_/g, ' ')}</span>
                  <StatusBadge status={evt.result} />
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{evt.reason || '—'}</p>
                <p className="text-[10px] text-slate-500">{new Date(evt.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

// ─── ROLE TITLE CONFIG ───────────────────────────────────────────
const roleDashboardConfig: Record<string, { title: string; subtitle: string }> = {
  admin: { title: 'Administration Dashboard', subtitle: 'Credential issuance, vault provisioning, and institutional client management' },
  portfolio_manager: { title: 'Portfolio Management Dashboard', subtitle: 'Capital deployment, strategy positions, and execution overview' },
  compliance_officer: { title: 'Compliance Dashboard', subtitle: 'Audit trail, governance controls, and regulatory monitoring' },
  emergency_admin: { title: 'Emergency Control Dashboard', subtitle: 'Vault pause controls, adapter status, and system health monitoring' },
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { currentRole, activeVaultId, activeSegment, setActiveSegment } = useStore();
  const data = useDashboardData();
  const config = roleDashboardConfig[currentRole] || roleDashboardConfig.admin;

  if (data.loading) {
    return <div className="p-8 text-slate-500">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{config.title}</h1>
        <p className="text-sm text-slate-700 mt-1">
          {config.subtitle}
          {activeVaultId && <span className="ml-2 text-slate-500">— Active vault: <span className="text-ink-900 font-mono">{activeVaultId}</span></span>}
        </p>
      </div>

      {currentRole === 'admin' && (
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-[12px] p-1.5 shadow-1">
          {([
            { id: 'individuals' as Segment, label: 'Individuals', count: data.vaults.length },
            { id: 'corporates' as Segment, label: 'Corporates', count: 0 },
            { id: 'b2b2c' as Segment, label: 'B2B2C Partners', count: 0 },
          ]).map(seg => (
            <button
              key={seg.id}
              onClick={() => setActiveSegment(seg.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-[10px] transition-all ease-amina duration-150 ${
                activeSegment === seg.id
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-ink-900 hover:bg-slate-50'
              }`}
            >
              {seg.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeSegment === seg.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{seg.count}</span>
            </button>
          ))}
        </div>
      )}

      {currentRole === 'admin' && <AdminDashboard data={data} />}
      {currentRole === 'portfolio_manager' && <PortfolioManagerDashboard data={data} />}
      {currentRole === 'compliance_officer' && <ComplianceOfficerDashboard data={data} />}
      {currentRole === 'emergency_admin' && <EmergencyAdminDashboard data={data} />}
    </div>
  );
}
