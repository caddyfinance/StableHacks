import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import LiquidityBufferWidget from '../../components/LiquidityBufferWidget';
import { FileCheck, Eye, CheckCircle } from 'lucide-react';

const fmt = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClientMandatePage() {
  const { activeVaultId, setActiveVaultId, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [loading, setLoading] = useState(true);
  const [mandate, setMandate] = useState<any>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);

  useEffect(() => {
    if (!activeVaultId) {
      api.getVaults().then((vaults) => {
        if (vaults.length > 0) setActiveVaultId(vaults[0].vaultId);
      }).catch(() => {});
    }
  }, [activeVaultId, setActiveVaultId]);

  useEffect(() => {
    if (!activeVaultId) return;
    setLoading(true);
    Promise.all([
      api.getMandate(activeVaultId).catch(() => null),
      api.getStrategies().catch(() => []),
      api.getSnapshot(activeVaultId).catch(() => null),
    ])
      .then(([mandateData, stratData, snapData]) => {
        if (mandateData && mandateData.status) setMandate(mandateData);
        setStrategies(stratData || []);
        setSnapshot(snapData);
      })
      .finally(() => setLoading(false));
  }, [activeVaultId]);

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Loading your vault...</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6"><p className="text-sm text-slate-500 animate-pulse">Loading mandate...</p></div>;
  }

  if (!mandate) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display text-ink-900">Investment Mandate</h1>
            <p className="text-xs text-slate-500 mt-0.5">Vault {activeVaultId}</p>
          </div>
        </div>
        <div className="bg-warning-100 border border-warning-700/20 rounded-lg p-4">
          <p className="text-sm text-warning-700 font-medium">No mandate configured yet</p>
          <p className="text-xs text-warning-700/80 mt-1">
            A mandate will be created automatically when the vault is activated. Once active, your investment rules and controls will appear here.
          </p>
        </div>
      </div>
    );
  }

  const maxAlloc = mandate.maxAllocationBps || {};
  const blockedStrategies: string[] = mandate.blockedStrategies || [];
  const allowedStrategies: string[] = mandate.allowedStrategies || [];
  const idleBuffer = Math.round((mandate.liquidityBufferBps || 0) / 100);

  const strategyRows = strategies.map((s) => {
    const id = s.strategyId || s.id;
    const allocBps = maxAlloc[id] ?? 0;
    const allocPct = Math.round(allocBps / 100);
    const isBlocked = blockedStrategies.includes(id);
    const isAllowed = allowedStrategies.includes(id);
    const status = isBlocked ? 'blocked' : isAllowed ? 'approved' : 'inactive';
    return { name: s.name || id, id, allocPct, status };
  });

  Object.keys(maxAlloc).forEach((key) => {
    if (!strategyRows.find((r) => r.id === key)) {
      const allocPct = Math.round((maxAlloc[key] || 0) / 100);
      const isBlocked = blockedStrategies.includes(key);
      strategyRows.push({ name: key, id: key, allocPct, status: isBlocked ? 'blocked' : 'approved' });
    }
  });

  // Live USDC figures from snapshot
  const lockedBuffer = snapshot?.requiredBuffer ?? (snapshot?.totalNAV ? (snapshot.totalNAV * (mandate.liquidityBufferBps ?? 1000)) / 10000 : null);
  const deployable = snapshot?.deployableBalance ?? null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display text-ink-900">Investment Mandate</h1>
            <p className="text-xs text-slate-500 mt-0.5">Vault {activeVaultId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Version badge */}
          {mandate.version && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200">
              v{mandate.version}
            </span>
          )}
          {/* On-chain sync badge */}
          {mandate.onChainSynced ? (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-md bg-success-100 text-success-700 border border-success-700/20">
              <CheckCircle className="w-3 h-3" /> On-Chain
            </span>
          ) : (
            <span className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
              Pending Sync
            </span>
          )}
          <StatusBadge status={mandate.status} size="md" />
          <span className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
            <Eye className="w-3 h-3" /> Read Only
          </span>
        </div>
      </div>

      {/* Liquidity Buffer Widget — client trust view */}
      {snapshot?.requiredBuffer != null ? (
        <LiquidityBufferWidget
          totalNAV={snapshot.totalNAV ?? 0}
          idleBalance={snapshot.idleBalance ?? 0}
          requiredBuffer={snapshot.requiredBuffer}
          deployableBalance={snapshot.deployableBalance ?? 0}
          bufferUtilization={snapshot.bufferUtilization ?? 0}
          bufferBps={mandate.liquidityBufferBps ?? 1000}
          variant="client"
        />
      ) : lockedBuffer != null ? (
        <div className="bg-teal-50 border border-teal-200/50 rounded-[18px] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-900">Liquidity Buffer — {idleBuffer}%</p>
            <StatusBadge status="active" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/70 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-500">Locked (reserved)</p>
              <p className="text-sm font-bold font-mono text-error-700">{fmt(lockedBuffer)} USDC</p>
            </div>
            {deployable != null && (
              <div className="bg-white/70 rounded-[10px] p-2.5 text-center">
                <p className="text-[10px] text-slate-500">Deployable</p>
                <p className="text-sm font-bold font-mono text-teal-700">{fmt(deployable)} USDC</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            Protocol-enforced. Fund managers cannot deploy the locked buffer portion.
          </p>
        </div>
      ) : null}

      {/* Strategy Allocations */}
      <Card title="Strategy Allocation Limits" subtitle="Maximum allocation per strategy as defined in your mandate">
        {strategyRows.length > 0 ? (
          <div className="space-y-3">
            {strategyRows.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-slate-100 rounded-md px-4 py-3">
                <div>
                  <p className="text-xs text-ink-900 font-medium">{s.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{s.id}</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={s.status} />
                  <span className="text-sm font-mono text-ink-900 font-semibold w-12 text-right">{s.allocPct}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No strategies configured</p>
        )}
      </Card>

      {/* Policy Controls */}
      <Card title="Policy Controls" subtitle="Consent thresholds and risk limits">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Consent Threshold', value: `${(mandate.consentThreshold || 0).toLocaleString()} USDC`, desc: 'Actions above this amount require your explicit approval' },
            { label: 'Min Idle Buffer', value: `${idleBuffer}%`, desc: 'Minimum capital that must stay undeployed' },
            { label: 'Leverage', value: mandate.leverageAllowed ? 'Permitted' : 'Not Permitted', desc: mandate.leverageAllowed ? 'Leveraged positions are allowed' : 'No leveraged positions' },
            { label: 'Mandate Version', value: `v${mandate.version || 1}`, desc: mandate.onChainSynced ? 'Synced to Solana' : 'Not yet on-chain' },
          ].map(({ label, value, desc }) => (
            <div key={label} className="bg-slate-100 rounded-md px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
              <p className="text-sm text-ink-900 font-semibold font-mono mt-1">{value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Approved Destination Wallets */}
      <Card title="Approved Destination Wallets" subtitle="Wallets authorized for withdrawals from your vault">
        {mandate.approvedDestinations?.length > 0 ? (
          <div className="space-y-1.5">
            {mandate.approvedDestinations.map((w: string, i: number) => (
              <div key={i} className="flex items-center gap-3 bg-slate-100 rounded-md px-4 py-2.5">
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-success-100 text-success-700 text-[10px] font-bold">{i + 1}</span>
                <span className="text-xs font-mono text-ink-900">{w}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No destination restrictions configured</p>
        )}
      </Card>

      {/* Policy Summary */}
      <Card title="Policy Summary" subtitle="Plain-English mandate restrictions">
        <ul className="space-y-1.5 text-xs text-ink-900 list-disc list-inside">
          {strategyRows.map((s) => (
            <li key={s.id}>
              {s.name} is{' '}
              {s.status === 'blocked' ? (
                <span className="text-error-700 font-medium">blocked</span>
              ) : (
                <>
                  <span className="text-success-700 font-medium">permitted</span> with a maximum allocation of <span className="font-medium">{s.allocPct}%</span>
                </>
              )}
              .
            </li>
          ))}
          <li>Transactions above <span className="font-medium">{(mandate.consentThreshold || 0).toLocaleString()} USDC</span> require explicit consent.</li>
          <li>A minimum idle buffer of <span className="font-medium">{idleBuffer}%</span> must be maintained at all times.</li>
          <li>Leverage is {mandate.leverageAllowed ? <span className="text-warning-700 font-medium">permitted</span> : <span className="text-success-700 font-medium">not permitted</span>}.</li>
          {mandate.onChainSynced && (
            <li>This mandate is <span className="text-success-700 font-medium">cryptographically anchored</span> to the Solana blockchain.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
