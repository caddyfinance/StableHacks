import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { TrendingUp, ArrowDownToLine, ArrowUpFromLine, Pause, RefreshCw, ExternalLink, CheckCircle, XCircle, Loader2, Wallet, Timer, ArrowRight } from 'lucide-react';

const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const DEVNET_RPC = (import.meta as any).env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/** Read on-chain USDC balance for a given address (PDA or wallet) */
async function fetchOnChainUsdcBalance(address: string): Promise<number> {
  try {
    const conn = new Connection(DEVNET_RPC, 'confirmed');
    const pubkey = new PublicKey(address);
    const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey, true);
    const info = await conn.getTokenAccountBalance(ata);
    return Number(info.value.uiAmount || 0);
  } catch {
    return 0;
  }
}

const SOLSTICE_STRATEGY_ID = 'solstice-eusx-yield';

type ActionTab = 'deploy' | 'withdraw' | 'idle';
type OutcomeType = 'approved' | 'blocked' | 'consent_required' | 'cooldown';

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

  // On-chain vault balance
  const [onChainBalance, setOnChainBalance] = useState<number | null>(null);
  const [vaultOnChainAddress, setVaultOnChainAddress] = useState<string | null>(null);

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

      // Fetch on-chain USDC balance from the AMINA bank wallet (custodial wallet where client deposits go)
      const vault = vaults.find((v: any) => v.vaultId === activeVaultId);
      const bankWallet = vault?.aminaBankWallet;
      if (bankWallet) {
        setVaultOnChainAddress(bankWallet);
        fetchOnChainUsdcBalance(bankWallet).then(setOnChainBalance).catch(() => setOnChainBalance(0));
      } else {
        // Fallback: fetch bank wallet from API
        api.getAminaWallet().then(({ wallet }) => {
          setVaultOnChainAddress(wallet);
          return fetchOnChainUsdcBalance(wallet);
        }).then(setOnChainBalance).catch(() => setOnChainBalance(0));
      }

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
  }, [activeVaultId, vaults, notify]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!activeVaultId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-700" />
            Portfolio Manager Execution Console
          </h1>
          <p className="text-xs text-slate-700 mt-1">Select a vault to manage capital.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[18px] shadow-1 p-4">
          <p className="text-xs text-slate-700 mb-3">Available vaults:</p>
          <div className="space-y-2">
            {vaults.map((v: any) => (
              <button key={v.vaultId} onClick={() => handleSelectVault(v.vaultId)}
                className="w-full flex items-center justify-between bg-teal-50 border border-slate-200 rounded-[12px] px-4 py-3 hover:border-teal-700 transition-colors text-left">
                <div>
                  <p className="text-sm font-mono font-semibold text-ink-900">{v.vaultId}</p>
                  <p className="text-xs text-slate-700">{v.clientReference || '—'} — {v.baseAsset || 'USDC'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status || 'active'} />
                  <span className="text-xs text-slate-700 font-mono">{fmt(v.totalNAV)} USDC</span>
                </div>
              </button>
            ))}
            {vaults.length === 0 && <p className="text-xs text-slate-700">No vaults found.</p>}
          </div>
        </div>
      </div>
    );
  }

  const fmt = (v: any) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse snapshot exposures (object → array), override Solstice with on-chain data
  const exposuresObj = snapshot?.strategyExposures || {};
  const positions = Object.entries(exposuresObj).map(([name, val]: [string, any]) => {
    const isSolsticePos = val?.strategyId === SOLSTICE_STRATEGY_ID || name === 'Solstice eUSX Yield';
    // For Solstice, prefer live on-chain position over snapshot
    const amount = isSolsticePos && solsticePosition?.usxValue != null ? solsticePosition.usxValue : (val?.amount || 0);
    return { name, amount, yield: val?.yield || 0, strategyId: val?.strategyId || name };
  });
  // Also add Solstice position if it exists on-chain but not in snapshot exposures
  if (solsticePosition?.eusxBalance > 0 && !positions.some(p => p.strategyId === SOLSTICE_STRATEGY_ID)) {
    positions.push({ name: 'Solstice eUSX Yield', amount: solsticePosition.usxValue, yield: 0, strategyId: SOLSTICE_STRATEGY_ID });
  }
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

  // Pull handler — routes Solstice through on-chain unlock+withdraw, others through DB unwind
  const handlePull = async () => {
    if (!selectedStrategy) { notify('error', 'Select a strategy to pull from'); return; }
    const strat = strategyRows.find(s => s.strategyId === selectedStrategy);
    const pullAmount = pullType === 'full' ? strat?.deployed || 0 : parseFloat(amount);
    if (isNaN(pullAmount) || pullAmount <= 0) { notify('error', 'Enter a valid amount'); return; }
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await api.unwind(activeVaultId!, { strategyId: selectedStrategy });
      if (res.status === 'cooldown') {
        setOutcome({ type: 'cooldown', strategyName: strat?.name || selectedStrategy, amount: pullAmount, reason: `eUSX unlocked on-chain (tx: ${res.unlockTx?.slice(0, 16)}...). Protocol cooldown in progress — funds will be available for withdrawal shortly.`, txSignature: res.unlockTx });
        notify('success', 'eUSX unlocked — cooldown in progress');
      } else {
        const reason = res.onChainVerified
          ? `On-chain unwind complete. Unlock tx: ${res.unlockTx?.slice(0, 16)}... Withdraw tx: ${res.withdrawTx?.slice(0, 16)}... Returned ${fmt(res.totalUnwind)} USDC to idle balance.`
          : `Pulled ${fmt(res.totalUnwind || pullAmount)} USDC back to idle balance`;
        setOutcome({ type: 'approved', strategyName: strat?.name || selectedStrategy, amount: res.totalUnwind || pullAmount, reason, txSignature: res.withdrawTx || res.unlockTx });
        notify('success', 'Capital pulled from strategy');
      }
      loadData();
    } catch (err: any) {
      notify('error', err?.message || 'Pull failed');
    } finally { setSubmitting(false); }
  };

  const outcomeColors: Record<OutcomeType, { border: string; bg: string; text: string }> = {
    approved: { border: 'border-success-700', bg: 'bg-success-100', text: 'text-success-700' },
    blocked: { border: 'border-error-700', bg: 'bg-error-100', text: 'text-error-700' },
    consent_required: { border: 'border-warning-700', bg: 'bg-warning-100', text: 'text-warning-700' },
    cooldown: { border: 'border-info-700', bg: 'bg-info-100', text: 'text-info-700' },
  };

  const tabs: { id: ActionTab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'deploy', label: 'Deploy Capital', icon: ArrowDownToLine },
    { id: 'withdraw', label: 'Withdraw Capital', icon: ArrowUpFromLine },
    { id: 'idle', label: 'Keep Idle', icon: Pause },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-700" />
            Portfolio Manager Execution Console
          </h1>
          <p className="text-xs text-slate-700 mt-1">
            Deploy, pull, and manage capital across approved strategies. All actions validated against mandate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Searchable vault picker */}
          <div className="relative">
            <button onClick={() => setVaultSearchOpen(!vaultSearchOpen)}
              className="flex items-center gap-2 bg-teal-50 border border-slate-200 hover:border-teal-700 rounded-[12px] px-3 py-1.5 transition-colors min-w-[220px]">
              <TrendingUp className="w-3.5 h-3.5 text-teal-700 flex-shrink-0" />
              <span className="text-xs text-ink-900 font-mono flex-1 text-left">
                {activeVaultId ? `${activeVaultId} — ${vaults.find((v: any) => v.vaultId === activeVaultId)?.clientReference || ''}` : 'Select vault...'}
              </span>
              <svg className={`w-3 h-3 text-slate-700 transition-transform ${vaultSearchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {vaultSearchOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVaultSearchOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-[320px] bg-white border border-slate-200 rounded-[18px] shadow-2 overflow-hidden">
                  <div className="p-2 border-b border-slate-200">
                    <input type="text" value={vaultSearch} onChange={(e) => setVaultSearch(e.target.value)} placeholder="Search vault ID or client..."
                      className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-1.5 text-xs text-ink-900 placeholder-slate-500 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600" autoFocus />
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {vaults.filter((v: any) => {
                      if (!vaultSearch) return true;
                      const q = vaultSearch.toLowerCase();
                      return v.vaultId?.toLowerCase().includes(q) || v.clientReference?.toLowerCase().includes(q);
                    }).map((v: any) => (
                      <button key={v.vaultId} onClick={() => { handleSelectVault(v.vaultId); setVaultSearchOpen(false); setVaultSearch(''); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-teal-50 transition-colors ${activeVaultId === v.vaultId ? 'bg-teal-700/10 border-l-2 border-teal-700' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-semibold text-ink-900">{v.vaultId}</p>
                          <p className="text-[10px] text-slate-700 truncate">{v.clientReference || '—'} — {v.baseAsset || 'USDC'}</p>
                        </div>
                        <StatusBadge status={v.status || 'active'} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-teal-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Capital Actions + Outcome */}
        <div className="lg:col-span-2 space-y-6">

          {/* Capital Actions Card with Tabs */}
          <div className="bg-white border border-slate-200 rounded-[18px] shadow-1">
            <div className="flex border-b border-slate-200">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setOutcome(null); setSelectedStrategy(''); setAmount(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                    tab === id ? 'text-teal-700 border-b-2 border-teal-700 bg-teal-700/5' : 'text-slate-700 hover:text-ink-900'
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
                  {/* Vault segregated balance card */}
                  <div className="bg-teal-50 border border-teal-200/50 rounded-[12px] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-teal-700" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Vault Available Balance</p>
                          <p className="text-lg font-bold font-mono text-ink-900">{fmt(snapshot?.idleBalance)} <span className="text-xs text-slate-500">USDC</span></p>
                        </div>
                      </div>
                      {(() => {
                        const vault = vaults.find((v: any) => v.vaultId === activeVaultId);
                        const vaultAddr = vault?.onChainAddress;
                        return vaultAddr ? (
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">Vault {activeVaultId}</p>
                            <a href={`https://solscan.io/account/${vaultAddr}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-teal-700 hover:underline font-mono flex items-center gap-1 justify-end">
                              {vaultAddr.slice(0, 6)}...{vaultAddr.slice(-4)} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {(snapshot?.idleBalance || 0) <= 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-[12px] p-3 text-center">
                      <p className="text-xs text-slate-500">No balance available to deploy. Deposit USDC into the vault first.</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Strategy</label>
                    <select value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 disabled:bg-slate-100 disabled:text-slate-400">
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
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Amount (USDC)</label>
                    <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250,000"
                      className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 disabled:bg-slate-100 disabled:text-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <p className="text-[10px] text-slate-700 mt-1">Available: {fmt(snapshot?.idleBalance)} USDC (vault segregated balance)</p>
                  </div>
                  {selectedStrategy && amount && (
                    <div className="bg-teal-50 rounded-[12px] p-3 text-xs space-y-1.5">
                      <p className="text-slate-700 uppercase tracking-wider text-[10px] font-semibold mb-1">
                        {isSolstice ? 'On-Chain Deployment Preview' : 'Mandate Validation Preview'}
                      </p>
                      <div className="flex justify-between"><span className="text-slate-700">Strategy</span><span className="text-ink-900">{strategies.find((s: any) => s.strategyId === selectedStrategy)?.name || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-700">Amount</span><span className="text-ink-900">{fmt(parseFloat(amount))} {isSolstice ? 'USX' : 'USDC'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-700">Post-deploy idle</span><span className="text-ink-900">{fmt((snapshot?.idleBalance || 0) - (parseFloat(amount) || 0))} USDC</span></div>
                      <div className="flex justify-between"><span className="text-slate-700">Mandate</span><StatusBadge status={snapshot?.mandateStatus || 'none'} /></div>
                      {isSolstice && (
                        <>
                          <div className="border-t border-slate-200/30 pt-1.5 mt-1.5">
                            <p className="text-[10px] text-slate-700 font-semibold mb-1">ON-CHAIN FUND FLOW</p>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-slate-700 text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-700" />
                                <span className="text-ink-900">1.</span> Deposit USDC from vault <span className="text-slate-400">-&gt;</span> <span className="text-ink-900">receive USX</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-700 text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-success-700" />
                                <span className="text-ink-900">2.</span> Lock USX <span className="text-slate-400">-&gt;</span> <span className="text-ink-900">Solstice Vault</span>
                                <span className="text-slate-400">-&gt;</span> <span className="text-success-700">eUSX (yield-bearing)</span>
                              </div>
                            </div>
                          </div>
                          {solsticePoolState && (
                            <div className="flex justify-between"><span className="text-slate-700">Exchange Rate</span><span className="text-teal-700 font-mono">{solsticePoolState.exchangeRate?.toFixed(6)}</span></div>
                          )}
                          {solsticePosition?.eusxBalance > 0 && (
                            <div className="flex justify-between"><span className="text-slate-700">Current eUSX Balance</span><span className="text-success-700 font-mono">{solsticePosition.eusxBalance.toFixed(4)}</span></div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <button onClick={handleDeploy} disabled={submitting || !selectedStrategy || !amount || (snapshot?.idleBalance || 0) <= 0}
                    className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold rounded-[12px] py-2.5 transition-colors flex items-center justify-center gap-2">
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? (isSolstice ? 'Executing on-chain...' : 'Validating & Deploying...') : (isSolstice ? 'Deploy to Solstice (On-Chain)' : 'Deploy to Strategy')}
                  </button>
                </div>
              )}

              {/* Pull Tab */}
              {tab === 'withdraw' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Strategy (active positions only)</label>
                    <select value={selectedStrategy} onChange={(e) => { setSelectedStrategy(e.target.value); const s = pullableStrategies.find(p => p.strategyId === e.target.value); if (pullType === 'full' && s) setAmount(String(s.deployed)); }}
                      className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600">
                      <option value="">Select strategy to pull from...</option>
                      {pullableStrategies.map(s => (
                        <option key={s.strategyId} value={s.strategyId}>{s.name} — {fmt(s.deployed)} USDC deployed</option>
                      ))}
                    </select>
                  </div>
                  {selectedStrategy && (
                    <div className="bg-teal-50 rounded-[12px] p-3 text-xs">
                      <div className="flex justify-between"><span className="text-slate-700">Current deployed</span><span className="text-ink-900 font-mono">{fmt(pullableStrategies.find(s => s.strategyId === selectedStrategy)?.deployed)} USDC</span></div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Pull Type</label>
                    <div className="flex gap-2">
                      {(['partial', 'full'] as const).map(t => (
                        <button key={t} onClick={() => { setPullType(t); if (t === 'full') { const s = pullableStrategies.find(p => p.strategyId === selectedStrategy); setAmount(String(s?.deployed || 0)); } else { setAmount(''); } }}
                          className={`flex-1 py-2 text-xs font-medium rounded-[12px] border transition-colors ${pullType === t ? 'bg-teal-700/10 border-teal-700 text-teal-700' : 'bg-teal-50 border-slate-200 text-slate-700 hover:text-ink-900'}`}>
                          {t === 'partial' ? 'Partial Pull' : 'Full Pull'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pullType === 'partial' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Amount (USDC)</label>
                      <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount to pull"
                        className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                  )}
                  <div className="bg-teal-100 border border-teal-300/40 rounded-[12px] p-2.5">
                    <p className="text-[10px] text-teal-700">Destination: Return to Idle Vault Balance</p>
                  </div>
                  <button onClick={handlePull} disabled={submitting || !selectedStrategy}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-semibold rounded-[12px] py-2.5 transition-colors">
                    {submitting ? 'Processing Pull...' : 'Pull from Strategy'}
                  </button>
                </div>
              )}

              {/* Keep Idle Tab */}
              {tab === 'idle' && (
                <div className="space-y-4">
                  <div className="bg-teal-50 rounded-[18px] p-4 text-center space-y-2">
                    <p className="text-2xl font-bold text-ink-900 font-mono">{fmt(snapshot?.idleBalance)} USDC</p>
                    <p className="text-xs text-slate-700">
                      Vault idle balance (segregated)
                      {vaultOnChainAddress && (
                        <a href={`https://solscan.io/account/${vaultOnChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="ml-1.5 text-teal-700 hover:underline inline-flex items-center gap-0.5 text-[10px]">
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </p>
                    <p className="text-xs text-slate-700">{idlePct.toFixed(1)}% of total vault NAV</p>
                  </div>
                  <div className="bg-teal-50 rounded-[12px] p-3 text-xs text-slate-700">
                    Capital can remain undeployed in the vault's idle balance. No strategy exposure is taken.
                    Idle capital is not earning yield but remains immediately available for deployment or redemption.
                  </div>
                  <button onClick={() => notify('info', 'Idle position confirmed. No capital action taken.')}
                    className="w-full bg-white border border-slate-200 hover:border-teal-700 text-slate-700 hover:text-ink-900 text-sm font-medium rounded-[12px] py-2.5 transition-colors">
                    Confirm No Action
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Outcome */}
          {outcome && (
            <div className={`rounded-[18px] border ${outcomeColors[outcome.type].border} ${outcomeColors[outcome.type].bg} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${outcomeColors[outcome.type].text}`}>
                  {outcome.type === 'approved' ? 'Approved & Executed' : outcome.type === 'blocked' ? 'Blocked by Compliance' : outcome.type === 'cooldown' ? 'Cooldown In Progress' : 'Pending Client Consent'}
                </h3>
                <StatusBadge status={outcome.type === 'approved' ? 'success' : outcome.type} size="md" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-700">Strategy</span><p className="text-ink-900 font-medium mt-0.5">{outcome.strategyName}</p></div>
                <div><span className="text-slate-700">Amount</span><p className="text-ink-900 font-medium mt-0.5">{fmt(outcome.amount)} USDC</p></div>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-700">Reason</span>
                <p className={`text-sm mt-1 ${outcomeColors[outcome.type].text}`}>{outcome.reason}</p>
              </div>
              {outcome.txSignature && outcome.txSignature.length > 30 && (
                <div className="border-t border-slate-200 pt-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-700">On-Chain Transaction</span>
                  <a href={`https://solscan.io/tx/${outcome.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-teal-700 hover:underline font-mono mt-1">
                    {outcome.txSignature.slice(0, 24)}... <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {outcome.consentRequestId && (
                <div className="border-t border-slate-200 pt-2"><span className="text-[10px] uppercase tracking-wider text-slate-700">Consent Request</span><p className="text-warning-700 text-xs font-mono mt-1">{outcome.consentRequestId}</p></div>
              )}
            </div>
          )}

          {/* Cooldown & Pending Withdrawals */}
          {((snapshot?.cooldownAllocations?.length || 0) > 0 || (snapshot?.pendingWithdrawals?.length || 0) > 0) && (
            <div className="bg-warning-100/50 border border-warning-700/20 rounded-[18px] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Timer className="w-4.5 h-4.5 text-warning-700" />
                <div>
                  <h3 className="text-sm font-semibold text-warning-700">Assets In Cooldown / Pending Withdrawal</h3>
                  <p className="text-[11px] text-warning-700/70">These assets are being unwound from strategies or awaiting admin approval for withdrawal.</p>
                </div>
              </div>

              {/* Cooldown Allocations */}
              {(snapshot?.cooldownAllocations?.length || 0) > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-warning-700/80 font-semibold mb-2">Strategy Cooldown</p>
                  <div className="space-y-2">
                    {snapshot.cooldownAllocations.map((a: any, i: number) => (
                      <div key={i} className="bg-white/80 border border-warning-700/10 rounded-[12px] px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-warning-100 border border-warning-700/20 flex items-center justify-center">
                            <Timer className="w-4 h-4 text-warning-700" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink-900">{a.strategyName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 bg-warning-100 text-warning-700 rounded font-semibold">COOLDOWN</span>
                              <span className="text-[10px] text-slate-500">Awaiting protocol cooldown period</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold font-mono text-warning-700">{fmt(a.amount)} <span className="text-xs text-slate-500">USDC</span></p>
                          {a.yieldAccrued > 0 && <p className="text-[10px] font-mono text-success-700">+{fmt(a.yieldAccrued)} yield</p>}
                          {a.txSignature && (
                            <a href={`https://solscan.io/tx/${a.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-teal-700 hover:underline font-mono flex items-center gap-1 justify-end mt-0.5">
                              {a.txSignature.slice(0, 12)}... <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 bg-white/60 rounded-[10px] px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-warning-700/80">Total in cooldown</span>
                    <span className="text-sm font-bold font-mono text-warning-700">{fmt(snapshot.totalCooldown)} USDC</span>
                  </div>
                </div>
              )}

              {/* Pending Withdrawal Requests */}
              {(snapshot?.pendingWithdrawals?.length || 0) > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-warning-700/80 font-semibold mb-2">Pending Withdrawal Requests</p>
                  <div className="space-y-2">
                    {snapshot.pendingWithdrawals.map((w: any, i: number) => (
                      <div key={i} className="bg-white/80 border border-warning-700/10 rounded-[12px] px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-warning-100 border border-warning-700/20 flex items-center justify-center">
                            <ArrowUpFromLine className="w-4 h-4 text-warning-700" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink-900">Withdrawal Request</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.5 bg-warning-100 text-warning-700 rounded font-semibold">PENDING</span>
                              <span className="text-[10px] font-mono text-slate-500">{w.requestId}</span>
                              {w.destinationWallet && (
                                <>
                                  <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                                  <span className="text-[10px] font-mono text-slate-500">{w.destinationWallet.slice(0, 6)}...{w.destinationWallet.slice(-4)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold font-mono text-warning-700">{fmt(w.amount)} <span className="text-xs text-slate-500">USDC</span></p>
                          <p className="text-[10px] text-slate-500">Awaiting admin approval</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 bg-white/60 rounded-[10px] px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] text-warning-700/80">Total pending withdrawal</span>
                    <span className="text-sm font-bold font-mono text-warning-700">{fmt(snapshot.totalPendingWithdrawal)} USDC</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Strategy Positions Table */}
          <Card title="Strategy Positions" subtitle={`${activeStrategies.length} active position${activeStrategies.length !== 1 ? 's' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
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
                    // For Solstice, use on-chain eUSX position as source of truth
                    const effectiveDeployed = isLive && solsticePosition?.usxValue != null ? solsticePosition.usxValue : s.deployed;
                    return (
                    <tr key={s.strategyId} className={`border-b border-slate-200/30 transition-colors ${isLive ? 'hover:bg-teal-50/50' : 'opacity-50'}`}>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-ink-900 font-medium">{s.name}</p>
                            <p className="text-[10px] text-slate-700">{s.riskLevel} risk</p>
                          </div>
                          {isLive ? (
                            <span className="text-[9px] px-1.5 py-0.5 bg-success-100 text-success-700 rounded font-semibold">LIVE</span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">COMING SOON</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2">
                        {isLive ? (
                          <StatusBadge status={s.disabled ? 'disabled' : effectiveDeployed > 0 ? 'active' : 'none'} />
                        ) : (
                          <span className="text-[10px] text-slate-700">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-mono text-ink-900">{effectiveDeployed > 0 ? fmt(effectiveDeployed) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-slate-700">{effectiveDeployed > 0 && totalNAV > 0 ? `${(effectiveDeployed / totalNAV * 100).toFixed(1)}%` : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-success-700">{s.yield > 0 ? `+${fmt(s.yield)}` : '—'}</td>
                      <td className="py-2.5 pr-2 text-right font-mono text-slate-700">{s.currentYield > 0 ? `${s.currentYield}%` : '—'}</td>
                      <td className="py-2.5 pr-2 text-center">
                        {isLive && effectiveDeployed > 0 ? (
                          <span className="text-success-700 text-[10px] font-medium">Yes</span>
                        ) : (
                          <span className="text-slate-700 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex gap-1.5 justify-end">
                          {isLive && !s.disabled && (
                            <button onClick={() => { setTab('deploy'); setSelectedStrategy(s.strategyId); setAmount(''); setOutcome(null); }}
                              className="text-[10px] text-teal-700 hover:underline">Deploy</button>
                          )}
                          {isLive && effectiveDeployed > 0 && !s.disabled && (
                            <button onClick={() => { setTab('withdraw'); setSelectedStrategy(s.strategyId); setPullType('full'); setAmount(String(effectiveDeployed)); setOutcome(null); }}
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
              <p className="text-xs text-slate-700 animate-pulse">Loading...</p>
            ) : (
              <div className="space-y-4">
                {/* NAV */}
                <div className="bg-teal-50 rounded-[18px] p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-700">Total NAV</p>
                  <p className="text-xl font-bold text-ink-900 font-mono mt-1">{fmt(totalNAV)}</p>
                  <p className="text-[10px] text-slate-700">USDC</p>
                </div>

                {/* Breakdown */}
                <div className="space-y-2">
                  {[
                    ['Idle Balance', fmt(snapshot?.idleBalance), `${idlePct.toFixed(1)}%`],
                    ['Deployed Balance', fmt(totalDeployed), `${deployedPct.toFixed(1)}%`],
                    ['Yield Accrued', `+${fmt(totalYield)}`, ''],
                  ].map(([label, value, pct]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{label}</span>
                      <div className="text-right">
                        <span className="text-ink-900 font-mono">{value}</span>
                        {pct && <span className="text-slate-700 ml-1.5 text-[10px]">{pct}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Allocation bar */}
                <div>
                  <div className="h-3 rounded-full bg-teal-50 overflow-hidden flex">
                    <div className="h-full bg-teal-700 transition-all" style={{ width: `${deployedPct}%` }} title="Deployed" />
                    <div className="h-full bg-slate-400 transition-all" style={{ width: `${idlePct}%` }} title="Idle" />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-700 mt-1">
                    <span>Deployed {deployedPct.toFixed(0)}%</span>
                    <span>Idle {idlePct.toFixed(0)}%</span>
                  </div>
                </div>

                {/* Status */}
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  {[
                    ['Mandate Status', snapshot?.mandateStatus || 'none'],
                    ['Risk Status', 'Green'],
                    ['Active Strategies', `${activeStrategies.length}`],
                    ['Pullable Positions', `${pullableStrategies.length}`],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{label}</span>
                      {(label === 'Mandate Status' || label === 'Risk Status')
                        ? <StatusBadge status={value as string} />
                        : <span className="text-ink-900 font-medium">{value}</span>
                      }
                    </div>
                  ))}
                </div>

                {/* Vault ID */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-700">Vault</span>
                    <span className="text-ink-900 font-mono">{snapshot?.vaultId || activeVaultId}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Solstice On-Chain Position */}
          {solsticePosition && (
            <Card title="Yield Position" subtitle="Solstice on-chain" className='mt-5'>
              {(() => {
                const eusx = solsticePosition.eusxBalance || 0;
                const usx = solsticePosition.usxValue || 0;
                const rate = solsticePoolState?.exchangeRate || 1;
                const yieldEarned = usx - eusx;
                const hasPosition = eusx > 0;
                const poolApy = strategies.find((s: any) => s.strategyId === SOLSTICE_STRATEGY_ID)?.currentYield || 0;

                return (
                  <div className="space-y-3">
                    {/* Main value */}
                    <div className="text-center py-2">
                      <p className="text-2xl font-bold font-mono text-ink-900">{fmt(usx)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">USDC value locked</p>
                    </div>

                    {/* Key metrics */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tokens held</span>
                        <span className="text-ink-900 font-mono">{eusx.toFixed(2)} eUSX</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Current APY</span>
                        <span className="text-success-700 font-semibold">{poolApy}%</span>
                      </div>
                      {yieldEarned > 0.001 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Yield earned</span>
                          <span className="text-success-700 font-mono">+{yieldEarned.toFixed(4)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Exchange rate</span>
                        <span className="text-slate-700 font-mono">1 eUSX = {rate.toFixed(4)} USX</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={`rounded-[8px] px-3 py-2 text-center text-[10px] font-medium ${hasPosition ? 'bg-success-100 text-success-700' : 'bg-slate-100 text-slate-500'}`}>
                      {hasPosition ? 'Earning yield' : 'No active position'}
                    </div>

                    {/* On-chain link */}
                    {solsticePosition.eusxAta && (
                      <a href={`https://solscan.io/account/${solsticePosition.eusxAta}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 text-[10px] text-teal-700 hover:underline font-mono">
                        View on Solscan <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                );
              })()}
            </Card>
          )}

          {/* Fund Flow Timeline */}
          {solsticeFundFlow.length > 0 && (
            <Card title="Fund Flow" subtitle="On-chain activity log" className='mt-5'>
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {solsticeFundFlow.slice(0, 15).map((e: any) => (
                  <div key={e.eventId} className={`bg-teal-50 rounded-[12px] px-3 py-2 border-l-2 ${
                    e.result === 'success' ? 'border-l-green-500' : e.result === 'pending' ? 'border-l-yellow-500' : 'border-l-red-500'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ink-900 font-medium">
                        {e.actionType.replace('SOLSTICE_', '').replaceAll('_', ' ')}
                      </span>
                      <span className="text-[9px] text-slate-700">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {e.amount != null && (
                      <span className="text-[10px] text-teal-700 font-mono">{e.amount} {e.asset}</span>
                    )}
                    {e.txSignature && (
                      <a href={`https://solscan.io/tx/${e.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] text-teal-700 hover:underline flex items-center gap-0.5 mt-0.5">
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
