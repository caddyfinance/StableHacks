import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import LiquidityBufferWidget from '../components/LiquidityBufferWidget';
import { FileCheck, Edit3, Save, X, RefreshCw, Link, CheckCircle, Loader2, ChevronDown } from 'lucide-react';

const fmt = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MandatePage() {
  const { activeVaultId, setActiveVaultId, notify } = useStore();
  const [loading, setLoading] = useState(true);
  const [mandate, setMandate] = useState<any>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [vaults, setVaults] = useState<any[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editBps, setEditBps] = useState(1000);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Load vault list once on mount
  useEffect(() => {
    api.getVaults().catch(() => []).then((list: any[]) => {
      setVaults(list || []);
      if (!activeVaultId && list.length > 0) {
        setActiveVaultId(list[0].vaultId);
      }
    });
  }, []);

  const reload = () => {
    if (!activeVaultId) return;
    setLoading(true);
    setMandate(null);
    Promise.all([
      api.getMandate(activeVaultId).catch(() => null),
      api.getStrategies().catch(() => []),
      api.getSnapshot(activeVaultId).catch(() => null),
    ])
      .then(([mandateData, strategiesData, snapData]) => {
        if (mandateData && mandateData.status) {
          setMandate(mandateData);
          setEditBps(mandateData.liquidityBufferBps ?? 1000);
        }
        setStrategies(strategiesData || []);
        setSnapshot(snapData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [activeVaultId]);

  const handleSave = async () => {
    if (!activeVaultId) return;
    setSaving(true);
    try {
      const updated = await api.updateMandate(activeVaultId, { liquidityBufferBps: editBps });
      setMandate(updated);
      setEditing(false);
      notify('success', `Mandate updated — buffer set to ${editBps / 100}%`);
      api.getSnapshot(activeVaultId).then(setSnapshot).catch(() => {});
    } catch (err: any) {
      notify('error', err?.message || err?.reason || 'Failed to update mandate');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToChain = async () => {
    if (!activeVaultId) return;
    setSyncing(true);
    try {
      const res = await api.syncMandateToChain(activeVaultId);
      notify('success', `Synced to chain — tx: ${(res.txSignature || '').slice(0, 16)}...`);
      reload();
    } catch (err: any) {
      notify('error', err?.message || 'Chain sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-500 text-sm">No vault selected.</p>
          <p className="text-slate-500 text-xs mt-1">Select an active vault from the dashboard to view its mandate.</p>
        </div>
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
            <h1 className="text-lg font-semibold text-ink-900">Mandate Details</h1>
            {vaults.length > 1 ? (
              <div className="relative mt-1 inline-flex items-center">
                <select
                  value={activeVaultId || ''}
                  onChange={(e) => setActiveVaultId(e.target.value)}
                  className="appearance-none text-xs text-teal-700 font-mono bg-teal-50 border border-teal-200 rounded-[8px] pl-2.5 pr-6 py-1 cursor-pointer hover:bg-teal-100 transition-colors focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  {vaults.map((v: any) => (
                    <option key={v.vaultId} value={v.vaultId}>
                      {v.vaultId}{v.clientReference ? ` — ${v.clientReference}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 w-3 h-3 text-teal-600 pointer-events-none" />
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{activeVaultId}</p>
            )}
          </div>
        </div>
        <div className="bg-warning-100 border border-warning-700/20 rounded-lg p-4">
          <p className="text-sm text-warning-700 font-medium">No mandate configured</p>
          <p className="text-xs text-warning-700/80 mt-1">The client has not set an investment mandate for this vault yet. The mandate is configured by the client from the Client Portal.</p>
        </div>
      </div>
    );
  }

  const strategyMap = new Map(strategies.map((s: any) => [s.id, s]));
  const maxAlloc = mandate.maxAllocationBps || {};
  const allowedStrategies: string[] = mandate.allowedStrategies || [];
  const blockedStrategies: string[] = mandate.blockedStrategies || [];
  const idleBuffer = Math.round((mandate.liquidityBufferBps || 0) / 100);

  const allocationRows = Object.entries(maxAlloc).map(([stratId, bps]) => {
    const strat = strategyMap.get(stratId);
    const name = strat?.name || stratId;
    const allocPct = Math.round((bps as number) / 100);
    const isBlocked = blockedStrategies.includes(stratId);
    return { id: stratId, name, alloc: allocPct, status: isBlocked ? 'blocked' : 'approved' };
  });
  const allocKeys = new Set(Object.keys(maxAlloc));
  [...blockedStrategies, ...allowedStrategies].forEach((stratId) => {
    if (!allocKeys.has(stratId)) {
      const strat = strategyMap.get(stratId);
      allocationRows.push({ id: stratId, name: strat?.name || stratId, alloc: 0, status: blockedStrategies.includes(stratId) ? 'blocked' : 'approved' });
      allocKeys.add(stratId);
    }
  });

  // Live USDC preview for slider
  const previewRequired = snapshot?.totalNAV != null ? (snapshot.totalNAV * editBps) / 10000 : null;
  const previewDeployable = snapshot?.totalNAV != null ? Math.max(0, (snapshot.idleBalance ?? 0) - previewRequired!) : null;
  const previewUtilization = previewRequired && previewRequired > 0 ? ((snapshot?.idleBalance ?? 0) / previewRequired) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink-900">Mandate Details</h1>
            {/* Vault selector */}
            {vaults.length > 1 ? (
              <div className="relative mt-1 inline-flex items-center">
                <select
                  value={activeVaultId || ''}
                  onChange={(e) => { setActiveVaultId(e.target.value); setEditing(false); }}
                  className="appearance-none text-xs text-teal-700 font-mono bg-teal-50 border border-teal-200 rounded-[8px] pl-2.5 pr-6 py-1 cursor-pointer hover:bg-teal-100 transition-colors focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  {vaults.map((v: any) => (
                    <option key={v.vaultId} value={v.vaultId}>
                      {v.vaultId}{v.clientReference ? ` — ${v.clientReference}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-1.5 w-3 h-3 text-teal-600 pointer-events-none" />
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{activeVaultId}</p>
            )}
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
              <CheckCircle className="w-3 h-3" /> On-Chain Synced
            </span>
          ) : (
            <span className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-warning-100 text-warning-700 border border-warning-700/20">
              Not Synced
            </span>
          )}
          <StatusBadge status={mandate.status} size="md" />
          <button onClick={() => reload()} className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-teal-700 transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Liquidity Buffer Card — editable */}
      <div className="bg-white border border-slate-200 rounded-[18px] shadow-1 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Liquidity Buffer</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Protocol minimum: 10% · Cannot be set below 10%</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <button
                  onClick={() => { setEditing(true); setEditBps(mandate.liquidityBufferBps ?? 1000); }}
                  className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-800 bg-teal-50 border border-teal-200 rounded-[10px] px-3 py-1.5 transition-colors">
                  <Edit3 className="w-3 h-3" /> Edit Buffer
                </button>
                {!mandate.onChainSynced && (
                  <button
                    onClick={handleSyncToChain}
                    disabled={syncing}
                    className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-ink-900 bg-white border border-slate-200 rounded-[10px] px-3 py-1.5 transition-colors disabled:opacity-50">
                    {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                    Sync to Chain
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-ink-900 transition-colors">
                  <X className="w-3 h-3" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || editBps < 1000}
                  className="flex items-center gap-1.5 text-xs text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-[10px] px-3 py-1.5 transition-colors">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-700 font-medium">Buffer: <span className="text-teal-700 font-bold">{editBps / 100}%</span></label>
                <span className="text-[10px] text-slate-500">Range: 10% – 50%</span>
              </div>
              <input
                type="range"
                min={1000}
                max={5000}
                step={100}
                value={editBps}
                onChange={(e) => setEditBps(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>10% (min)</span>
                <span>50% (max)</span>
              </div>
            </div>

            {/* Live USDC preview */}
            {snapshot?.totalNAV != null && previewRequired != null && (
              <div className="bg-teal-50 rounded-[12px] p-3 space-y-1.5 text-xs">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Live Preview (current NAV)</p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total NAV</span>
                  <span className="text-ink-900 font-mono">{fmt(snapshot.totalNAV)} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Required buffer ({editBps / 100}%)</span>
                  <span className="text-error-700 font-mono font-semibold">{fmt(previewRequired)} USDC locked</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Max deployable</span>
                  <span className="text-teal-700 font-mono font-semibold">{fmt(previewDeployable!)} USDC</span>
                </div>
                {editBps < 1000 && (
                  <p className="text-error-700 text-[10px] mt-1">Buffer cannot be set below 10% (protocol minimum)</p>
                )}
              </div>
            )}

            {/* Buffer widget preview */}
            {snapshot?.totalNAV != null && previewRequired != null && (
              <LiquidityBufferWidget
                totalNAV={snapshot.totalNAV}
                idleBalance={snapshot.idleBalance ?? 0}
                requiredBuffer={previewRequired}
                deployableBalance={previewDeployable!}
                bufferUtilization={previewUtilization}
                bufferBps={editBps}
                variant="admin"
              />
            )}
          </div>
        ) : (
          <>
            {snapshot?.requiredBuffer != null ? (
              <LiquidityBufferWidget
                totalNAV={snapshot.totalNAV ?? 0}
                idleBalance={snapshot.idleBalance ?? 0}
                requiredBuffer={snapshot.requiredBuffer}
                deployableBalance={snapshot.deployableBalance ?? 0}
                bufferUtilization={snapshot.bufferUtilization ?? 0}
                bufferBps={mandate.liquidityBufferBps ?? 1000}
                variant="admin"
              />
            ) : (
              <div className="bg-teal-50 rounded-[12px] p-3 text-center">
                <p className="text-sm font-bold text-teal-700">{idleBuffer}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">of total NAV must remain idle</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Strategy Allocations */}
      <Card title="Strategy Allocation Limits" subtitle="Maximum allocation per strategy as set by the client">
        {allocationRows.length > 0 ? (
          <div className="space-y-3">
            {allocationRows.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-slate-100 rounded-md px-4 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-ink-900 font-medium">{s.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{s.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={s.status} />
                  <span className="text-sm font-mono text-ink-900 font-semibold w-12 text-right">{s.alloc}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No strategy allocations configured.</p>
        )}
      </Card>

      {/* Policy Controls */}
      <Card title="Policy Controls" subtitle="Consent thresholds and risk limits">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Consent Threshold', value: `${(mandate.consentThreshold || 0).toLocaleString()} USDC`, desc: 'Actions above this require client approval' },
            { label: 'Min Idle Buffer', value: `${idleBuffer}%`, desc: 'Minimum capital kept undeployed' },
            { label: 'Leverage', value: mandate.leverageAllowed ? 'Permitted' : 'Not Permitted', desc: mandate.leverageAllowed ? 'Leveraged positions allowed' : 'No leveraged positions' },
            { label: 'Mandate Version', value: `v${mandate.version || 1}`, desc: mandate.lastUpdatedBy ? `Last updated by ${mandate.lastUpdatedBy}` : 'Initial version' },
          ].map(({ label, value, desc }) => (
            <div key={label} className="bg-slate-100 rounded-md px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
              <p className="text-sm text-ink-900 font-semibold font-mono mt-1">{value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Approved Destinations */}
      <Card title="Approved Destination Wallets" subtitle="Wallets authorized for withdrawals">
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
          {allocationRows.map((s) => (
            <li key={s.id}>
              {s.name} is{' '}
              {s.status === 'blocked' ? (
                <span className="text-error-700 font-medium">blocked</span>
              ) : (
                <>
                  <span className="text-success-700 font-medium">permitted</span>
                  {s.alloc > 0 && (
                    <> with a maximum allocation of <span className="font-medium">{s.alloc}%</span></>
                  )}
                </>
              )}
              .
            </li>
          ))}
          <li>Transactions above <span className="font-medium">{(mandate.consentThreshold || 0).toLocaleString()} USDC</span> require explicit consent.</li>
          <li>A minimum idle buffer of <span className="font-medium">{idleBuffer}%</span> must be maintained.</li>
          <li>Leverage is {mandate.leverageAllowed ? <span className="text-warning-700 font-medium">permitted</span> : <span className="text-success-700 font-medium">not permitted</span>}.</li>
        </ul>
      </Card>
    </div>
  );
}
