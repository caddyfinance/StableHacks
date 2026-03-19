import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { TrendingUp, ArrowDownToLine, ArrowUpFromLine, Pause, RefreshCw, ExternalLink, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const SOLSTICE_STRATEGY_ID = 'solstice-eusx-yield';

type ActionTab = 'deploy' | 'pull' | 'idle';
type OutcomeType = 'approved' | 'blocked' | 'consent_required';

interface Outcome {
  type: OutcomeType;
  strategyName: string;
  amount: number;
  reason: string;
  consentRequestId?: string;
  txSignature?: string;
}

export default function ExecutionPage() {
  const { activeVaultId, setActiveVaultId, notify } = useStore();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vaults, setVaults] = useState<any[]>([]);
  const [vaultSearchOpen, setVaultSearchOpen] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');

  // Action state
  const [tab, setTab] = useState<ActionTab>('deploy');
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [amount, setAmount] = useState('');
  const [pullType, setPullType] = useState<'partial' | 'full'>('partial');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Solstice on-chain position
  const [solsticePosition, setSolsticePosition] = useState<any>(null);
  const [solsticePoolState, setSolsticePoolState] = useState<any>(null);
  const [solsticeFundFlow, setSolsticeFundFlow] = useState<any[]>([]);

  // Load vaults list
  useEffect(() => {
    api.getVaults().then(setVaults).catch(() => {});
  }, []);

  const handleSelectVault = (id: string) => {
    if (id === activeVaultId) return;
    setActiveVaultId(id);
    setLoading(true);
    setOutcome(null);
  };

  const loadData = useCallback(async () => {
    if (!activeVaultId) return;
    setLoading(true);
    try {
      const [strats, snap] = await Promise.all([api.getStrategies(), api.getSnapshot(activeVaultId)]);
      setStrategies(strats);
      setSnapshot(snap);
      // Load Solstice data in parallel (non-blocking)
      Promise.all([
        api.solsticePosition(activeVaultId).catch(() => null),
        api.solsticePoolState().catch(() => null),
        api.solsticeFundFlow(activeVaultId).catch(() => []),
      ]).then(([pos, pool, flow]) => {
        setSolsticePosition(pos);
        setSolsticePoolState(pool);
        setSolsticeFundFlow(flow);
      });
    } catch (err: any) {
      notify('error', err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeVaultId, notify]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!activeVaultId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-vault-accent" />
            Portfolio Manager Execution Console
          </h1>
          <p className="text-xs text-vault-muted mt-1">Select a vault to manage capital.</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-xs text-vault-muted mb-3">Available vaults:</p>
          <div className="space-y-2">
            {vaults.map((v: any) => (
              <button key={v.vaultId} onClick={() => handleSelectVault(v.vaultId)}
                className="w-full flex items-center justify-between bg-vault-bg border border-vault-border rounded-lg px-4 py-3 hover:border-vault-accent transition-colors text-left">
                <div>
                  <p className="text-sm font-mono font-semibold text-white">{v.vaultId}</p>
                  <p className="text-xs text-vault-muted">{v.clientReference || '—'} — {v.baseAsset || 'USDC'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status || 'active'} />
                  <span className="text-xs text-vault-muted font-mono">{fmt(v.totalNAV)} USDC</span>
                </div>
              </button>
            ))}
            {vaults.length === 0 && <p className="text-xs text-vault-muted">No vaults found.</p>}
          </div>
        </div>
      </div>
    );
  }

  const fmt = (v: any) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse snapshot exposures (object → array)
  const exposuresObj = snapshot?.strategyExposures || {};
  const positions = Object.entries(exposuresObj).map(([name, val]: [string, any]) => ({
    name, amount: val?.amount || 0, yield: val?.yield || 0, strategyId: val?.strategyId || name,
  }));
  const totalDeployed = positions.reduce((s, p) => s + p.amount, 0);
  const totalYield = positions.reduce((s, p) => s + p.yield, 0);
  const totalNAV = (snapshot?.idleBalance || 0) + totalDeployed + totalYield;
  const idlePct = totalNAV > 0 ? ((snapshot?.idleBalance || 0) / totalNAV * 100) : 0;
  const deployedPct = totalNAV > 0 ? (totalDeployed / totalNAV * 100) : 0;

  // Merge strategies with positions for the table
  const strategyRows = strategies.map((s: any) => {
    const pos = positions.find(p => p.strategyId === s.strategyId);
    return {
      strategyId: s.strategyId,
      name: s.name,
      disabled: s.disabled,
      riskLevel: s.riskLevel,
      currentYield: s.currentYield || 0,
      deployed: pos?.amount || 0,
      yield: pos?.yield || 0,
      allocPct: totalNAV > 0 ? ((pos?.amount || 0) / totalNAV * 100) : 0,
      active: (pos?.amount || 0) > 0,
    };
  });

  const activeStrategies = strategyRows.filter(s => s.active);
  const pullableStrategies = strategyRows.filter(s => s.deployed > 0 && !s.disabled);

  const isSolstice = selectedStrategy === SOLSTICE_STRATEGY_ID;

  // Deploy handler — routes Solstice through on-chain lock, others through DB allocate
  const handleDeploy = async () => {
    const parsed = parseFloat(amount);
    if (!selectedStrategy || isNaN(parsed) || parsed <= 0) { notify('error', 'Select a strategy and enter a valid amount'); return; }
    setSubmitting(true);
    setOutcome(null);
    const strat = strategies.find((s: any) => s.strategyId === selectedStrategy);

    try {
      if (isSolstice) {
        // On-chain Solstice lock (USX -> eUSX)
        const res = await api.solsticeLock(activeVaultId!, parsed);
        setOutcome({
          type: 'approved',
          strategyName: strat?.name || 'Solstice eUSX Yield',
          amount: parsed,
          reason: [
            `Locked ${parsed} USX into Solstice eUSX yield vault on-chain.`,
            res.onChainVerified ? 'On-chain verified.' : '',
            res.eusxReceived ? `eUSX received: ${res.eusxReceived}.` : '',
            `Pre: ${res.preBalanceUSX} USX / ${res.preBalanceEUSX} eUSX.`,
            `Post: ${res.postBalanceUSX} USX / ${res.postBalanceEUSX} eUSX.`,
          ].filter(Boolean).join(' '),
          txSignature: res.txSignature,
        });
        notify('success', `Locked ${parsed} USX into Solstice — on-chain confirmed`);
        loadData();
      } else {
        // DB-only allocation for other strategies
        const res = await fetch(`/api/vaults/${activeVaultId}/allocate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-role': 'portfolio_manager' },
          body: JSON.stringify({ strategyId: selectedStrategy, amount: parsed }),
        });
        const data = await res.json();
        if (res.status === 201) {
          setOutcome({ type: 'approved', strategyName: strat?.name || selectedStrategy, amount: parsed, reason: data.message || 'Deployed successfully', txSignature: data.allocation?.id });
          notify('success', 'Capital deployed');
          loadData();
        } else if (res.status === 403) {
          setOutcome({ type: 'blocked', strategyName: strat?.name || selectedStrategy, amount: parsed, reason: data.reason || 'Blocked by mandate' });
        } else if (res.status === 202) {
          setOutcome({ type: 'consent_required', strategyName: strat?.name || selectedStrategy, amount: parsed, reason: data.reason || 'Client consent required', consentRequestId: data.requestId });
        } else {
          notify('error', data.message || 'Failed');
        }
      }
    } catch (err: any) { notify('error', err?.message || 'Request failed'); }
    finally { setSubmitting(false); }
  };

  // Pull handler
  const handlePull = async () => {
    if (!selectedStrategy) { notify('error', 'Select a strategy to pull from'); return; }
    const strat = strategyRows.find(s => s.strategyId === selectedStrategy);
    const pullAmount = pullType === 'full' ? strat?.deployed || 0 : parseFloat(amount);
    if (isNaN(pullAmount) || pullAmount <= 0) { notify('error', 'Enter a valid amount'); return; }
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await api.unwind(activeVaultId!, { strategyId: selectedStrategy });
      setOutcome({ type: 'approved', strategyName: strat?.name || selectedStrategy, amount: pullAmount, reason: `Pulled ${fmt(pullAmount)} USDC back to idle balance` });
      notify('success', 'Capital pulled from strategy');
      loadData();
    } catch (err: any) {
      notify('error', err?.message || 'Pull failed');
    } finally { setSubmitting(false); }
  };

  const outcomeColors: Record<OutcomeType, { border: string; bg: string; text: string }> = {
    approved: { border: 'border-green-700', bg: 'bg-green-900/20', text: 'text-green-400' },
    blocked: { border: 'border-red-700', bg: 'bg-red-900/20', text: 'text-red-400' },
    consent_required: { border: 'border-yellow-700', bg: 'bg-yellow-900/20', text: 'text-yellow-400' },
  };

  const tabs: { id: ActionTab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'deploy', label: 'Deploy Capital', icon: ArrowDownToLine },
    { id: 'pull', label: 'Pull Capital', icon: ArrowUpFromLine },
    { id: 'idle', label: 'Keep Idle', icon: Pause },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-vault-accent" />
            Portfolio Manager Execution Console
          </h1>
          <p className="text-xs text-vault-muted mt-1">
            Deploy, pull, and manage capital across approved strategies. All actions validated against mandate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Searchable vault picker */}
          <div className="relative">
            <button onClick={() => setVaultSearchOpen(!vaultSearchOpen)}
              className="flex items-center gap-2 bg-vault-bg border border-vault-border hover:border-vault-accent rounded px-3 py-1.5 transition-colors min-w-[220px]">
              <TrendingUp className="w-3.5 h-3.5 text-vault-accent flex-shrink-0" />
              <span className="text-xs text-white font-mono flex-1 text-left">
                {activeVaultId ? `${activeVaultId} — ${vaults.find((v: any) => v.vaultId === activeVaultId)?.clientReference || ''}` : 'Select vault...'}
              </span>
              <svg className={`w-3 h-3 text-vault-muted transition-transform ${vaultSearchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {vaultSearchOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVaultSearchOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-[320px] bg-vault-card border border-vault-border rounded-lg shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-vault-border">
                    <input type="text" value={vaultSearch} onChange={(e) => setVaultSearch(e.target.value)} placeholder="Search vault ID or client..."
                      className="w-full bg-vault-bg border border-vault-border rounded px-3 py-1.5 text-xs text-white placeholder-vault-muted focus:outline-none focus:border-vault-accent" autoFocus />
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {vaults.filter((v: any) => {
                      if (!vaultSearch) return true;
                      const q = vaultSearch.toLowerCase();
                      return v.vaultId?.toLowerCase().includes(q) || v.clientReference?.toLowerCase().includes(q);
                    }).map((v: any) => (
                      <button key={v.vaultId} onClick={() => { handleSelectVault(v.vaultId); setVaultSearchOpen(false); setVaultSearch(''); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-vault-bg transition-colors ${activeVaultId === v.vaultId ? 'bg-vault-accent/10 border-l-2 border-vault-accent' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-semibold text-white">{v.vaultId}</p>
                          <p className="text-[10px] text-vault-muted truncate">{v.clientReference || '—'} — {v.baseAsset || 'USDC'}</p>
                        </div>
                        <StatusBadge status={v.status || 'active'} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Capital Actions + Outcome */}
        <div className="lg:col-span-2 space-y-6">

          {/* Capital Actions Card with Tabs */}
          <div className="bg-vault-card border border-vault-border rounded-lg">
            <div className="flex border-b border-vault-border">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setOutcome(null); setSelectedStrategy(''); setAmount(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                    tab === id ? 'text-vault-accent border-b-2 border-vault-accent bg-vault-accent/5' : 'text-vault-muted hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Deploy Tab */}
              {tab === 'deploy' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-vault-muted mb-1.5">Strategy</label>
                    <select value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value)}
                      className="w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-vault-accent">
                      <option value="">Select strategy to deploy into...</option>
                      {strategies.map((s: any) => {
                        const isLive = s.strategyId === SOLSTICE_STRATEGY_ID;
                        return (
                          <option key={s.strategyId} value={s.strategyId} disabled={!isLive}>
                            {s.name} — APY {s.currentYield || 0}%{isLive ? ' (On-Chain)' : ' (Coming Soon)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-vault-muted mb-1.5">Amount (USDC)</label>
                    <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250,000"
                      className="w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-vault-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <p className="text-[10px] text-vault-muted mt-1">Available idle: {fmt(snapshot?.idleBalance)} USDC</p>
                  </div>
                  {selectedStrategy && amount && (
                    <div className="bg-vault-bg rounded p-3 text-xs space-y-1.5">
                      <p className="text-vault-muted uppercase tracking-wider text-[10px] font-semibold mb-1">
                        {isSolstice ? 'On-Chain Deployment Preview' : 'Mandate Validation Preview'}
                      </p>
                      <div className="flex justify-between"><span className="text-vault-muted">Strategy</span><span className="text-white">{strategies.find((s: any) => s.strategyId === selectedStrategy)?.name || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-vault-muted">Amount</span><span className="text-white">{fmt(parseFloat(amount))} {isSolstice ? 'USX' : 'USDC'}</span></div>
                      <div className="flex justify-between"><span className="text-vault-muted">Post-deploy idle</span><span className="text-white">{fmt((snapshot?.idleBalance || 0) - (parseFloat(amount) || 0))} USDC</span></div>
                      <div className="flex justify-between"><span className="text-vault-muted">Mandate</span><StatusBadge status={snapshot?.mandateStatus || 'none'} /></div>
                      {isSolstice && (
                        <>
                          <div className="border-t border-vault-border/30 pt-1.5 mt-1.5">
                            <p className="text-[10px] text-vault-muted font-semibold mb-1">ON-CHAIN FUND FLOW</p>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-vault-muted text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-vault-accent" />
                                <span className="text-white">1.</span> Deposit USDC from vault <span className="text-vault-border">-&gt;</span> <span className="text-white">receive USX</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-vault-muted text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                <span className="text-white">2.</span> Lock USX <span className="text-vault-border">-&gt;</span> <span className="text-white">Solstice Vault</span>
                                <span className="text-vault-border">-&gt;</span> <span className="text-green-400">eUSX (yield-bearing)</span>
                              </div>
                            </div>
                          </div>
                          {solsticePoolState && (
                            <div className="flex justify-between"><span className="text-vault-muted">Exchange Rate</span><span className="text-vault-accent font-mono">{solsticePoolState.exchangeRate?.toFixed(6)}</span></div>
                          )}
                          {solsticePosition?.eusxBalance > 0 && (
                            <div className="flex justify-between"><span className="text-vault-muted">Current eUSX Balance</span><span className="text-green-400 font-mono">{solsticePosition.eusxBalance.toFixed(4)}</span></div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <button onClick={handleDeploy} disabled={submitting || !selectedStrategy || !amount}
                    className="w-full bg-vault-accent hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded py-2.5 transition-colors flex items-center justify-center gap-2">
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? (isSolstice ? 'Executing on-chain...' : 'Validating & Deploying...') : (isSolstice ? 'Deploy to Solstice (On-Chain)' : 'Deploy to Strategy')}
                  </button>
                </div>
              )}

              {/* Pull Tab */}
              {tab === 'pull' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-vault-muted mb-1.5">Strategy (active positions only)</label>
                    <select value={selectedStrategy} onChange={(e) => { setSelectedStrategy(e.target.value); const s = pullableStrategies.find(p => p.strategyId === e.target.value); if (pullType === 'full' && s) setAmount(String(s.deployed)); }}
                      className="w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-vault-accent">
                      <option value="">Select strategy to pull from...</option>
                      {pullableStrategies.map(s => (
                        <option key={s.strategyId} value={s.strategyId}>{s.name} — {fmt(s.deployed)} USDC deployed</option>
                      ))}
                    </select>
                  </div>
                  {selectedStrategy && (
                    <div className="bg-vault-bg rounded p-3 text-xs">
                      <div className="flex justify-between"><span className="text-vault-muted">Current deployed</span><span className="text-white font-mono">{fmt(pullableStrategies.find(s => s.strategyId === selectedStrategy)?.deployed)} USDC</span></div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-vault-muted mb-1.5">Pull Type</label>
                    <div className="flex gap-2">
                      {(['partial', 'full'] as const).map(t => (
                        <button key={t} onClick={() => { setPullType(t); if (t === 'full') { const s = pullableStrategies.find(p => p.strategyId === selectedStrategy); setAmount(String(s?.deployed || 0)); } else { setAmount(''); } }}
                          className={`flex-1 py-2 text-xs font-medium rounded border transition-colors ${pullType === t ? 'bg-vault-accent/10 border-vault-accent text-vault-accent' : 'bg-vault-bg border-vault-border text-vault-muted hover:text-white'}`}>
                          {t === 'partial' ? 'Partial Pull' : 'Full Pull'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pullType === 'partial' && (
                    <div>
                      <label className="block text-xs font-medium text-vault-muted mb-1.5">Amount (USDC)</label>
                      <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount to pull"
                        className="w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-vault-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                  )}
                  <div className="bg-blue-900/15 border border-blue-800/40 rounded p-2.5">
                    <p className="text-[10px] text-blue-300">Destination: Return to Idle Vault Balance</p>
                  </div>
                  <button onClick={handlePull} disabled={submitting || !selectedStrategy}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded py-2.5 transition-colors">
                    {submitting ? 'Processing Pull...' : 'Pull from Strategy'}
                  </button>
                </div>
              )}

              {/* Keep Idle Tab */}
              {tab === 'idle' && (
                <div className="space-y-4">
                  <div className="bg-vault-bg rounded-lg p-4 text-center space-y-2">
                    <p className="text-2xl font-bold text-white font-mono">{fmt(snapshot?.idleBalance)} USDC</p>
                    <p className="text-xs text-vault-muted">Current idle balance</p>
                    <p className="text-xs text-vault-muted">{idlePct.toFixed(1)}% of total vault NAV</p>
                  </div>
                  <div className="bg-vault-bg rounded p-3 text-xs text-vault-muted">
                    Capital can remain undeployed in the vault's idle balance. No strategy exposure is taken.
                    Idle capital is not earning yield but remains immediately available for deployment or redemption.
                  </div>
                  <button onClick={() => notify('info', 'Idle position confirmed. No capital action taken.')}
                    className="w-full bg-vault-card border border-vault-border hover:border-vault-accent text-vault-muted hover:text-white text-sm font-medium rounded py-2.5 transition-colors">
                    Confirm No Action
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Outcome */}
          {outcome && (
            <div className={`rounded-lg border ${outcomeColors[outcome.type].border} ${outcomeColors[outcome.type].bg} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${outcomeColors[outcome.type].text}`}>
                  {outcome.type === 'approved' ? 'Approved & Executed' : outcome.type === 'blocked' ? 'Blocked by Compliance' : 'Pending Client Consent'}
                </h3>
                <StatusBadge status={outcome.type === 'approved' ? 'success' : outcome.type} size="md" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-vault-muted">Strategy</span><p className="text-white font-medium mt-0.5">{outcome.strategyName}</p></div>
                <div><span className="text-vault-muted">Amount</span><p className="text-white font-medium mt-0.5">{fmt(outcome.amount)} USDC</p></div>
              </div>
              <div className="border-t border-white/10 pt-2">
                <span className="text-[10px] uppercase tracking-wider text-vault-muted">Reason</span>
                <p className={`text-sm mt-1 ${outcomeColors[outcome.type].text}`}>{outcome.reason}</p>
              </div>
              {outcome.txSignature && outcome.txSignature.length > 30 && (
                <div className="border-t border-white/10 pt-2">
                  <span className="text-[10px] uppercase tracking-wider text-vault-muted">On-Chain Transaction</span>
                  <a href={`https://solscan.io/tx/${outcome.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-vault-accent hover:underline font-mono mt-1">
                    {outcome.txSignature.slice(0, 24)}... <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {outcome.consentRequestId && (
                <div className="border-t border-white/10 pt-2"><span className="text-[10px] uppercase tracking-wider text-vault-muted">Consent Request</span><p className="text-yellow-400 text-xs font-mono mt-1">{outcome.consentRequestId}</p></div>
              )}
            </div>
          )}

          {/* Strategy Positions Table */}
          <Card title="Strategy Positions" subtitle={`${activeStrategies.length} active position${activeStrategies.length !== 1 ? 's' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-vault-border text-[10px] uppercase tracking-wider text-vault-muted">
                    <th className="text-left py-2 pr-2 font-semibold">Strategy</th>
                    <th className="text-left py-2 pr-2 font-semibold">Status</th>
                    <th className="text-right py-2 pr-2 font-semibold">Deployed</th>
                    <th className="text-right py-2 pr-2 font-semibold">Alloc %</th>
                    <th className="text-right py-2 pr-2 font-semibold">Yield</th>
                    <th className="text-right py-2 pr-2 font-semibold">APY</th>
                    <th className="text-center py-2 pr-2 font-semibold">Pullable</th>
                    <th className="text-right py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyRows.map(s => {
                    const isLive = s.strategyId === SOLSTICE_STRATEGY_ID;
                    const solsticeDeployed = isLive && solsticePosition?.usxValue ? solsticePosition.usxValue : 0;
                    const effectiveDeployed = isLive ? (s.deployed + solsticeDeployed) : s.deployed;
                    return (
                    <tr key={s.strategyId} className={`border-b border-vault-border/30 transition-colors ${isLive ? 'hover:bg-vault-bg/50' : 'opacity-50'}`}>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-white font-medium">{s.name}</p>
                            <p className="text-[10px] text-vault-muted">{s.riskLevel} risk</p>
                          </div>
                          {isLive ? (
                            <span className="text-[9px] px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded font-semibold">LIVE</span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 bg-vault-border/50 text-vault-muted rounded font-semibold">COMING SOON</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2">
                        {isLive ? (
                          <StatusBadge status={s.disabled ? 'disabled' : effectiveDeployed > 0 ? 'active' : 'none'} />
                        ) : (
                          <span className="text-[10px] text-vault-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono text-white">{effectiveDeployed > 0 ? fmt(effectiveDeployed) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-vault-muted">{effectiveDeployed > 0 && totalNAV > 0 ? `${(effectiveDeployed / totalNAV * 100).toFixed(1)}%` : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-green-400">{s.yield > 0 ? `+${fmt(s.yield)}` : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-vault-muted">{s.currentYield > 0 ? `${s.currentYield}%` : '—'}</td>
                      <td className="py-2.5 pr-2 text-center">
                        {isLive && effectiveDeployed > 0 ? (
                          <span className="text-green-400 text-[10px] font-medium">Yes</span>
                        ) : (
                          <span className="text-vault-muted text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex gap-1.5 justify-end">
                          {isLive && !s.disabled && (
                            <button onClick={() => { setTab('deploy'); setSelectedStrategy(s.strategyId); setAmount(''); setOutcome(null); }}
                              className="text-[10px] text-vault-accent hover:underline">Deploy</button>
                          )}
                          {isLive && effectiveDeployed > 0 && !s.disabled && (
                            <button onClick={() => { setTab('pull'); setSelectedStrategy(s.strategyId); setPullType('full'); setAmount(String(effectiveDeployed)); setOutcome(null); }}
                              className="text-[10px] text-amber-400 hover:underline">Pull</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* RIGHT: Vault Exposure Summary */}
        <div>
          <Card title="Vault Exposure Summary" subtitle="Real-time allocation overview">
            {loading ? (
              <p className="text-xs text-vault-muted animate-pulse">Loading...</p>
            ) : (
              <div className="space-y-4">
                {/* NAV */}
                <div className="bg-vault-bg rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted">Total NAV</p>
                  <p className="text-xl font-bold text-white font-mono mt-1">{fmt(totalNAV)}</p>
                  <p className="text-[10px] text-vault-muted">USDC</p>
                </div>

                {/* Breakdown */}
                <div className="space-y-2">
                  {[
                    ['Idle Balance', fmt(snapshot?.idleBalance), `${idlePct.toFixed(1)}%`],
                    ['Deployed Balance', fmt(totalDeployed), `${deployedPct.toFixed(1)}%`],
                    ['Yield Accrued', `+${fmt(totalYield)}`, ''],
                  ].map(([label, value, pct]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs">
                      <span className="text-vault-muted">{label}</span>
                      <div className="text-right">
                        <span className="text-white font-mono">{value}</span>
                        {pct && <span className="text-vault-muted ml-1.5 text-[10px]">{pct}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Allocation bar */}
                <div>
                  <div className="h-3 rounded-full bg-vault-bg overflow-hidden flex">
                    <div className="h-full bg-vault-accent transition-all" style={{ width: `${deployedPct}%` }} title="Deployed" />
                    <div className="h-full bg-gray-600 transition-all" style={{ width: `${idlePct}%` }} title="Idle" />
                  </div>
                  <div className="flex justify-between text-[10px] text-vault-muted mt-1">
                    <span>Deployed {deployedPct.toFixed(0)}%</span>
                    <span>Idle {idlePct.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Status */}
                <div className="border-t border-vault-border pt-3 space-y-2">
                  {[
                    ['Mandate Status', snapshot?.mandateStatus || 'none'],
                    ['Risk Status', 'Green'],
                    ['Active Strategies', `${activeStrategies.length}`],
                    ['Pullable Positions', `${pullableStrategies.length}`],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs">
                      <span className="text-vault-muted">{label}</span>
                      {(label === 'Mandate Status' || label === 'Risk Status')
                        ? <StatusBadge status={value as string} />
                        : <span className="text-white font-medium">{value}</span>
                      }
                    </div>
                  ))}
                </div>

                {/* Vault ID */}
                <div className="border-t border-vault-border pt-3">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-vault-muted">Vault</span>
                    <span className="text-white font-mono">{snapshot?.vaultId || activeVaultId}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Solstice On-Chain Position */}
          {solsticePosition && (
            <Card title="Solstice eUSX Position" subtitle="On-chain yield position">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-vault-bg rounded p-2.5 text-center">
                    <p className="text-sm font-bold text-white font-mono">{solsticePosition.eusxBalance?.toFixed(4) || '0'}</p>
                    <p className="text-[10px] text-vault-muted">eUSX</p>
                  </div>
                  <div className="bg-vault-bg rounded p-2.5 text-center">
                    <p className="text-sm font-bold text-green-400 font-mono">{solsticePosition.usxValue?.toFixed(4) || '0'}</p>
                    <p className="text-[10px] text-vault-muted">USX Value</p>
                  </div>
                </div>
                {solsticePoolState && (
                  <div className="flex justify-between text-xs">
                    <span className="text-vault-muted">Exchange Rate</span>
                    <span className="text-vault-accent font-mono">{solsticePoolState.exchangeRate?.toFixed(6)}</span>
                  </div>
                )}
                {solsticePosition.eusxAta && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-vault-muted">eUSX ATA</span>
                    <a href={`https://solscan.io/account/${solsticePosition.eusxAta}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="text-vault-accent hover:underline flex items-center gap-0.5 font-mono">
                      {solsticePosition.eusxAta.slice(0, 6)}...{solsticePosition.eusxAta.slice(-4)}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Fund Flow Timeline */}
          {solsticeFundFlow.length > 0 && (
            <Card title="Fund Flow" subtitle="On-chain activity log">
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {solsticeFundFlow.slice(0, 15).map((e: any) => (
                  <div key={e.eventId} className={`bg-vault-bg rounded px-3 py-2 border-l-2 ${
                    e.result === 'success' ? 'border-l-green-500' : e.result === 'pending' ? 'border-l-yellow-500' : 'border-l-red-500'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white font-medium">
                        {e.actionType.replace('SOLSTICE_', '').replaceAll('_', ' ')}
                      </span>
                      <span className="text-[9px] text-vault-muted">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {e.amount != null && (
                      <span className="text-[10px] text-vault-accent font-mono">{e.amount} {e.asset}</span>
                    )}
                    {e.txSignature && (
                      <a href={`https://solscan.io/tx/${e.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] text-vault-accent hover:underline flex items-center gap-0.5 mt-0.5">
                        {e.txSignature.slice(0, 16)}... <ExternalLink className="w-2 h-2" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
