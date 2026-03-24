import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from '@solana/spl-token';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import NotVerified from '../../components/NotVerified';
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, ExternalLink, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';

const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const DEVNET_RPC = (import.meta as any).env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const USDC_DECIMALS = 6;

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
const truncate = (s: string, len = 14) => s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

type TxStep = 'idle' | 'building' | 'signing' | 'confirming' | 'recording' | 'done' | 'error';
const STEP_LABELS: Record<TxStep, string> = {
  idle: '', building: 'Building transaction...', signing: 'Approve in your wallet...',
  confirming: 'Confirming on Solana...', recording: 'Recording...', done: 'Complete!', error: 'Failed',
};
const STEPS_ORDER: TxStep[] = ['building', 'signing', 'confirming', 'recording'];

function StrategyTabs({ vault, strategies, activeAllocs, deployed }: { vault: any; strategies: any[]; activeAllocs: any[]; deployed: number }) {
  const [tab, setTab] = useState<'active' | 'allowed' | 'blocked'>('active');
  const totalAllocated = activeAllocs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
  const nav = vault.totalNAV || 0;

  const allowedNotActive = strategies
    .filter((s: any) => vault.mandate?.allowedStrategies?.includes(s.strategyId))
    .filter((s: any) => !activeAllocs.some((a: any) => a.strategyId === s.strategyId));
  const blockedStrats = strategies.filter((s: any) => vault.mandate?.blockedStrategies?.includes(s.strategyId));

  const tabs = [
    { key: 'active' as const, label: 'Active', count: activeAllocs.length },
    { key: 'allowed' as const, label: 'Allowed', count: allowedNotActive.length },
    { key: 'blocked' as const, label: 'Blocked', count: blockedStrats.length },
  ];

  return (
    <Card title="Strategies" subtitle="">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium transition-colors relative ${tab === t.key ? 'text-ink-900' : 'text-slate-500 hover:text-ink-900'}`}>
            {t.label} {t.count > 0 && <span className="ml-1 text-slate-500">({t.count})</span>}
            {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-700 rounded-t" />}
          </button>
        ))}
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        activeAllocs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2 pr-4 font-semibold border-b border-slate-200">Strategy</th>
                  <th className="text-left py-2 pr-4 font-semibold border-b border-slate-200">Risk</th>
                  <th className="text-right py-2 pr-4 font-semibold border-b border-slate-200">Allocated</th>
                  <th className="text-right py-2 pr-4 font-semibold border-b border-slate-200">% of NAV</th>
                  <th className="text-right py-2 pr-4 font-semibold border-b border-slate-200">Yield</th>
                  <th className="text-right py-2 font-semibold border-b border-slate-200">Current APY</th>
                </tr>
              </thead>
              <tbody>
                {activeAllocs.map((a: any, i: number) => {
                  const strat = strategies.find((s: any) => s.strategyId === a.strategyId);
                  const pct = nav > 0 ? ((a.amount || 0) / nav * 100) : 0;
                  return (
                    <tr key={i} className={`hover:bg-teal-50 ${i < activeAllocs.length - 1 ? 'border-b border-slate-200/60' : ''}`}>
                      <td className="py-3 pr-4">
                        <p className="text-ink-900 font-medium">{a.strategy?.name || a.strategyId}</p>
                        {strat?.description && <p className="text-[10px] text-slate-500 mt-0.5">{strat.description}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${strat?.riskLevel === 'low' ? 'bg-success-100 text-success-700' : strat?.riskLevel === 'high' ? 'bg-error-100 text-error-700' : 'bg-warning-100 text-warning-700'}`}>
                          {strat?.riskLevel || '—'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-ink-900">{fmt(a.amount || 0)}</td>
                      <td className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-700 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-slate-500 font-mono w-10 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-success-700">{a.yieldAccrued > 0 ? `+${fmt(a.yieldAccrued)}` : '—'}</td>
                      <td className="py-3 text-right font-mono text-teal-700">{strat?.currentYield ? `${strat.currentYield}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Summary bar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 text-xs">
              <span className="text-slate-500">Total deployed: <span className="text-ink-900 font-mono font-semibold">{fmt(totalAllocated)}</span> USDC</span>
              <span className="text-slate-500">{nav > 0 ? (totalAllocated / nav * 100).toFixed(1) : '0.0'}% of NAV deployed</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4">No active allocations. The portfolio manager will deploy funds to strategies from the idle balance.</p>
        )
      )}

      {/* Allowed tab */}
      {tab === 'allowed' && (
        allowedNotActive.length > 0 ? (
          <div className="space-y-2">
            {allowedNotActive.map((s: any) => {
              const maxBps = (vault.mandate?.maxAllocationBps as any)?.[s.strategyId] || 0;
              const maxPct = maxBps / 100;
              return (
                <div key={s.strategyId} className="flex items-center justify-between bg-slate-100 rounded-[18px] px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink-900 font-medium">{s.name}</p>
                    <p className="text-[10px] text-slate-500">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.riskLevel === 'low' ? 'bg-success-100 text-success-700' : s.riskLevel === 'high' ? 'bg-error-100 text-error-700' : 'bg-warning-100 text-warning-700'}`}>
                      {s.riskLevel}
                    </span>
                    {maxPct > 0 && <span className="text-[10px] text-slate-500">Max {maxPct}%</span>}
                    <span className="text-xs font-mono text-teal-700">{s.currentYield}% APY</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4">All allowed strategies are currently active.</p>
        )
      )}

      {/* Blocked tab */}
      {tab === 'blocked' && (
        blockedStrats.length > 0 ? (
          <div className="space-y-2">
            {blockedStrats.map((s: any) => (
              <div key={s.strategyId} className="flex items-center justify-between bg-slate-100 rounded-[18px] px-4 py-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 line-through">{s.name}</p>
                  <p className="text-[10px] text-slate-500">{s.description}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-error-100 text-error-700">{s.riskLevel}</span>
                  <span className="text-[10px] text-error-700">Blocked by mandate</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4">No strategies are blocked.</p>
        )
      )}

      {!vault.mandate && (
        <p className="text-xs text-slate-500 py-2">Strategies will be available after mandate is attached (auto-created on first deposit).</p>
      )}
    </Card>
  );
}

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify, clientInfo, setActiveVaultId } = useStore();
  const { publicKey, sendTransaction } = useWallet();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [vault, setVault] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Deposit/Withdraw state
  const [mode, setMode] = useState<'none' | 'deposit' | 'withdraw'>('none');
  const [amount, setAmount] = useState('');
  const [destWallet, setDestWallet] = useState('');
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showMandateModal, setShowMandateModal] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const [strategies, setStrategies] = useState<any[]>([]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [vaultData, snap, evts, strats] = await Promise.all([
        api.getVaults().then(vs => vs.find((v: any) => v.vaultId === id)),
        api.getSnapshot(id).catch(() => null),
        api.getEvents(id).catch(() => []),
        api.getStrategies().catch(() => []),
      ]);
      setStrategies(strats);
      setVault(vaultData);
      setSnapshot(snap);
      setEvents(evts);
      if (vaultData) setActiveVaultId(vaultData.vaultId);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [id]);

  const resetTx = () => {
    setMode('none');
    setAmount('');
    setDestWallet('');
    setTxStep('idle');
    setTxSig(null);
    setTxError(null);
  };

  const handleDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { notify('error', 'Enter a valid amount'); return; }

    if (!publicKey) {
      notify('error', 'Connect your wallet to deposit USDC');
      return;
    }

    if (!vault?.onChainAddress) { notify('error', 'Vault has no on-chain address'); return; }

    setTxStep('building');
    setTxSig(null);
    setTxError(null);

    try {
      const connection = new Connection(DEVNET_RPC, 'confirmed');
      const vaultPda = new PublicKey(vault.onChainAddress);
      const amountLamports = BigInt(Math.round(amt * 10 ** USDC_DECIMALS));
      const userAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const vaultAta = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);

      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountIdempotentInstruction(publicKey, vaultAta, vaultPda, USDC_MINT));
      tx.add(createTransferInstruction(userAta, vaultAta, publicKey, amountLamports));
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      setTxStep('signing');
      const sig = await sendTransaction(tx, connection);
      setTxSig(sig);

      setTxStep('confirming');
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const { value } = await connection.getSignatureStatuses([sig]);
        if (value[0]?.confirmationStatus === 'confirmed' || value[0]?.confirmationStatus === 'finalized') {
          if (value[0].err) throw new Error('Transaction failed on-chain');
          break;
        }
        if (i === 29) throw new Error('Not confirmed in 45s');
      }

      setTxStep('recording');
      await api.deposit(vault.vaultId, { amount: amt, sourceWallet: publicKey.toBase58(), sourceReference: sig, sourceType: 'On-Chain USDC Transfer' });

      setTxStep('done');
      notify('success', `${fmt(amt)} USDC deposited into ${vault.vaultId}`);
      await loadData();
    } catch (e: any) {
      setTxError(e?.message || 'Deposit failed');
      setTxStep('error');
      notify('error', e?.message?.includes('User rejected') ? 'Cancelled' : (e?.message || 'Failed'));
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { notify('error', 'Enter a valid amount'); return; }
    if (!publicKey) { notify('error', 'Connect your wallet to request withdrawal'); return; }
    const destWalletAddr = publicKey.toBase58();

    setTxStep('recording');
    setTxError(null);
    try {
      await api.redeem(vault.vaultId, { amount: amt, destinationWallet: destWalletAddr });
      setTxStep('done');
      notify('success', `Withdrawal request for ${fmt(amt)} USDC submitted`);
      await loadData();
    } catch (e: any) {
      setTxError(e?.message || 'Request failed');
      setTxStep('error');
      notify('error', e?.message || 'Failed');
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500 animate-pulse">Loading vault...</p></div>;
  if (!vault) return <div className="p-6"><p className="text-sm text-slate-500">Vault not found.</p></div>;

  const activeAllocs = vault.allocations?.filter((a: any) => a.status === 'active') || [];
  const deployed = activeAllocs.reduce((s: number, a: any) => s + (a.amount || 0), 0);
  const yieldTotal = activeAllocs.reduce((s: number, a: any) => s + (a.yieldAccrued || 0), 0);
  const recentEvents = events.slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/client/vaults')} className="text-slate-500 hover:text-ink-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono font-display text-ink-900">{vault.vaultId}</h1>
            <StatusBadge status={vault.status} />
            {vault.paused && <span className="text-[9px] px-1.5 py-0.5 bg-error-100 text-error-700 rounded font-semibold">PAUSED</span>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{vault.baseAsset} segregated vault for {vault.clientReference}</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Money Deployed</p>
          <p className="text-xl font-bold font-mono font-display text-ink-900">{fmt(vault.totalNAV || 0)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">USDC in vault</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Yield Earned</p>
          <p className="text-xl font-bold font-mono font-display text-success-700">+{fmt(yieldTotal)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">USDC accrued</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Current APY</p>
          <p className="text-xl font-bold font-mono font-display text-success-700">
            {(vault.totalDeposited || 0) > 0 ? `${((yieldTotal / (vault.totalDeposited || 1)) * 365 * 100).toFixed(2)}%` : '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Annualised from yield / deposits</p>
        </div>
      </div>

      {/* Vault Status Banner for initiated vaults */}
      {vault.status === 'initiated' && (
        <div className="bg-warning-100 border border-warning-700/20 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-warning-700">Vault Pending Activation</p>
            <p className="text-[10px] text-warning-700/80">Review and approve the mandate to activate this vault and enable deposits.</p>
          </div>
          <button onClick={() => { resetTx(); setShowMandateModal(true); }}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-[12px] transition-colors shadow-1">
            Review Mandate & Activate
          </button>
        </div>
      )}

      {/* Actions: Deposit / Withdraw — only for active vaults */}
      {vault.status === 'active' && !vault.paused && (
        <div className="flex gap-3">
          <button onClick={() => { resetTx(); setMode('deposit'); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[12px] border transition-colors shadow-1 ${mode === 'deposit' ? 'bg-success-700 text-white border-success-700' : 'bg-white text-teal-700 border-teal-300/40 hover:bg-teal-100'}`}>
            <ArrowDownToLine className="w-3.5 h-3.5" /> Deposit USDC
          </button>
          <button onClick={() => { resetTx(); setMode('withdraw'); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[12px] border transition-colors shadow-1 ${mode === 'withdraw' ? 'bg-warning-700 text-white border-warning-700' : 'bg-white text-warning-700 border-warning-700/30 hover:bg-warning-100'}`}>
            <ArrowUpFromLine className="w-3.5 h-3.5" /> Request Withdrawal
          </button>
        </div>
      )}

      {/* Mandate & Terms Modal — must scroll to end to accept */}
      {showMandateModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { setShowMandateModal(false); setHasScrolledToEnd(false); }}>
          <div className="bg-white border border-slate-200 rounded-[24px] max-w-lg w-full flex flex-col shadow-3" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-sm font-bold text-ink-900">Vault Terms & Mandate</h3>
              <p className="text-[10px] text-slate-500 mt-1">Read and scroll to the end to accept before depositing into {vault.vaultId}</p>
            </div>

            <div
              className="p-5 overflow-y-auto flex-1"
              onScroll={e => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 30) {
                  setHasScrolledToEnd(true);
                }
              }}
            >
              <div className="space-y-4 text-xs text-slate-500 leading-relaxed">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">1. Segregated Vault Agreement</p>
                  <p>By depositing digital assets into this segregated vault ("{vault.vaultId}"), you ("the Client") acknowledge and agree that your assets will be managed by AMINA Bank AG ("the Custodian") under the terms of this mandate. This vault is individually segregated and non-commingled — your assets are not pooled with those of other clients.</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">2. Custody & Safekeeping</p>
                  <p>All digital assets deposited into this vault are held in custody by the Custodian on the Solana blockchain. The vault operates through a smart contract deployed at a unique program address. The Custodian maintains sole authority over the vault's on-chain operations, including allocation to approved strategies and processing of withdrawal requests.</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">3. Investment Mandate</p>
                  {vault.mandate ? (
                    <div className="space-y-2 ml-2">
                      <p>The following mandate governs the management of assets in this vault:</p>
                      <div className="bg-slate-100 rounded-[18px] p-3 space-y-1.5">
                        {[
                          ['Mandate Status', vault.mandate.status?.toUpperCase()],
                          ['Liquidity Buffer', `${(vault.mandate.liquidityBufferBps / 100).toFixed(0)}% of NAV maintained as idle balance`],
                          ['Consent Threshold', `${fmt(vault.mandate.consentThreshold)} USDC — transactions above this require client approval`],
                          ['Leverage', vault.mandate.leverageAllowed ? 'Permitted' : 'Not permitted'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-slate-500">{label}</span>
                            <span className="text-ink-900 font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p>A default conservative mandate will be created upon your first deposit. This includes a 10% liquidity buffer, 40% maximum allocation per strategy, and a 250,000 USDC consent threshold.</p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">4. Approved Strategies</p>
                  <p className="mb-2">The Custodian may only deploy your assets into the following pre-approved strategies:</p>
                  <div className="bg-slate-100 rounded-[18px] p-3 space-y-1.5">
                    {vault.mandate ? strategies
                      .filter((s: any) => vault.mandate.allowedStrategies?.includes(s.strategyId))
                      .map((s: any) => (
                        <div key={s.strategyId} className="flex items-center justify-between">
                          <span className="text-ink-900">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${s.riskLevel === 'low' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>{s.riskLevel}</span>
                            <span className="text-slate-500 font-mono">{s.currentYield}% APY</span>
                          </div>
                        </div>
                      ))
                    : (
                      <p>Solstice eUSX Yield (low risk)</p>
                    )}
                  </div>
                  {vault.mandate?.blockedStrategies?.length > 0 && (
                    <p className="mt-2">The following strategies are explicitly blocked: {strategies.filter((s: any) => vault.mandate.blockedStrategies?.includes(s.strategyId)).map((s: any) => s.name).join(', ')}.</p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">5. Withdrawals</p>
                  <p>Withdrawal requests are submitted by the Client and processed by the Custodian. Funds will only be sent to pre-approved destination wallets. Processing times may vary depending on strategy unwind requirements and compliance checks.</p>
                  {vault.mandate?.approvedDestinations?.length > 0 && (
                    <div className="bg-slate-100 rounded-[18px] p-3 mt-2 space-y-1">
                      <p className="text-slate-500 font-semibold">Approved destinations:</p>
                      {vault.mandate.approvedDestinations.map((d: string, i: number) => (
                        <p key={i} className="font-mono text-ink-900">{truncate(d, 24)}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">6. Risks</p>
                  <p>Digital asset investments carry inherent risks including but not limited to: smart contract risk, market volatility, liquidity risk, and regulatory risk. Past performance is not indicative of future results. The Custodian does not guarantee returns on deposited assets.</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">7. Compliance & Audit Trail</p>
                  <p>All vault operations are recorded on-chain and in the Custodian's compliance database. The Client may view the complete audit trail through the Activity Log. On-chain transactions are verifiable via the Solana blockchain explorer.</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">8. Governing Law</p>
                  <p>This agreement is governed by the laws of Switzerland. Any disputes shall be resolved through arbitration in Zurich, Switzerland under the rules of the Swiss Chambers' Arbitration Institution.</p>
                </div>

                <div className="bg-warning-100 border border-warning-700/20 rounded-[18px] p-3 mt-4">
                  <p className="text-[10px] text-warning-700">
                    By clicking "Accept & Proceed to Deposit" below, you confirm that you have read, understood, and agree to the terms and mandate rules set out above. You acknowledge that your deposited funds will be managed according to these terms.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex-shrink-0">
              {!hasScrolledToEnd && (
                <p className="text-[10px] text-slate-500 text-center mb-3 animate-pulse">Scroll to the end to accept the terms</p>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowMandateModal(false); setHasScrolledToEnd(false); }}
                  className="px-4 py-2 text-xs text-slate-500 hover:text-ink-900 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (vault.status === 'initiated') {
                      try {
                        await api.activateVault(vault.vaultId);
                        notify('success', 'Mandate approved — vault is now active');
                        await loadData();
                      } catch (e: any) {
                        notify('error', e?.message || 'Failed to activate vault');
                      }
                    }
                    setShowMandateModal(false);
                    setHasScrolledToEnd(false);
                    if (vault.status === 'active') setMode('deposit');
                  }}
                  disabled={!hasScrolledToEnd}
                  className={`px-5 py-2 text-xs font-semibold rounded-[12px] flex items-center gap-1.5 transition-colors shadow-1 ${hasScrolledToEnd ? 'bg-success-700 text-white hover:bg-teal-800' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  {vault.status === 'initiated' ? 'Approve Mandate & Activate Vault' : 'Accept & Proceed to Deposit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit/Withdraw Form */}
      {mode !== 'none' && (
        <Card title={mode === 'deposit' ? 'Deposit USDC On-Chain' : 'Request Withdrawal'} subtitle={mode === 'deposit' ? 'USDC transfers from your wallet to the vault on Solana' : 'Submit a withdrawal request. Amina Bank will process and transfer funds to your wallet.'}>
          {txStep === 'idle' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input type="number" placeholder="Amount (USDC)" value={amount} onChange={e => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-[12px] text-sm text-ink-900 font-mono focus:outline-none focus:ring-teal-600/20 focus:border-teal-600" />
              </div>
              {mode === 'withdraw' && publicKey && (
                <p className="text-[10px] text-slate-500">Funds will be redeemed to your wallet: <span className="font-mono text-ink-900">{publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-6)}</span></p>
              )}
              <div className="flex items-center gap-2">
                <button onClick={mode === 'deposit' ? handleDeposit : handleWithdraw}
                  className={`px-4 py-2 text-xs font-semibold rounded-[12px] flex items-center gap-1.5 shadow-1 ${mode === 'deposit' ? 'bg-success-700 hover:bg-teal-800 text-white' : 'bg-warning-700 hover:bg-warning-700 text-white'}`}>
                  {mode === 'deposit' ? <><ArrowDownToLine className="w-3.5 h-3.5" /> {publicKey ? 'Transfer On-Chain' : 'Record Deposit'}</> : <><ArrowUpFromLine className="w-3.5 h-3.5" /> Submit Request</>}
                </button>
                <button onClick={resetTx} className="text-xs text-slate-500 hover:text-ink-900 px-3 py-2">Cancel</button>
              </div>
            </div>
          )}

          {txStep !== 'idle' && txStep !== 'done' && txStep !== 'error' && (
            <div className="space-y-2">
              {STEPS_ORDER.map((step, i) => {
                const currentIdx = STEPS_ORDER.indexOf(txStep);
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isDone ? 'bg-success-700 text-white' : isCurrent ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {isDone ? '\u2713' : isCurrent ? <Loader2 className="w-3 h-3 animate-spin" /> : i + 1}
                    </div>
                    <span className={`text-xs ${isDone ? 'text-success-700' : isCurrent ? 'text-ink-900' : 'text-slate-500'}`}>{STEP_LABELS[step]}</span>
                  </div>
                );
              })}
              {txSig && (
                <a href={`https://solscan.io/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-teal-700 hover:underline mt-2">
                  Tx: {truncate(txSig, 18)} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}

          {txStep === 'done' && (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 ${mode === 'deposit' ? 'text-success-700' : 'text-warning-700'}`}>
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">
                  {mode === 'deposit' ? 'USDC deposited on-chain' : 'Withdrawal request submitted — pending Amina Bank approval'}
                </span>
              </div>
              {txSig && (
                <a href={`https://solscan.io/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-teal-700 hover:underline">
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button onClick={resetTx} className="text-xs text-slate-500 hover:text-ink-900">Done</button>
            </div>
          )}

          {txStep === 'error' && (
            <div className="space-y-2">
              <p className="text-xs text-error-700">{txError}</p>
              <button onClick={resetTx} className="text-xs text-slate-500 hover:text-ink-900">Try again</button>
            </div>
          )}
        </Card>
      )}

      {/* Mandate & Strategy Policy */}
      {vault.mandate ? (
        <Card title="Mandate Policy" subtitle="Investment rules governing this vault">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs py-1.5">
                <span className="text-slate-500">Mandate Status</span>
                <StatusBadge status={vault.mandate.status} />
              </div>
              <div className="flex justify-between text-xs py-1.5">
                <span className="text-slate-500">Liquidity Buffer</span>
                <span className="text-ink-900 font-mono">{(vault.mandate.liquidityBufferBps / 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between text-xs py-1.5">
                <span className="text-slate-500">Consent Threshold</span>
                <span className="text-ink-900 font-mono">{fmt(vault.mandate.consentThreshold)} USDC</span>
              </div>
              <div className="flex justify-between text-xs py-1.5">
                <span className="text-slate-500">Leverage</span>
                <span className={`text-xs font-medium ${vault.mandate.leverageAllowed ? 'text-warning-700' : 'text-success-700'}`}>
                  {vault.mandate.leverageAllowed ? 'Allowed' : 'Not Allowed'}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Approved Destinations</p>
              {vault.mandate.approvedDestinations?.length > 0 ? (
                <div className="space-y-1">
                  {vault.mandate.approvedDestinations.map((d: string, i: number) => (
                    <p key={i} className="text-xs font-mono text-ink-900">{truncate(d, 20)}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No restrictions</p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Mandate Policy" subtitle="">
          <p className="text-xs text-slate-500 py-2">No mandate attached. A default mandate will be created on first deposit.</p>
        </Card>
      )}

      {/* Strategies — tabbed */}
      <StrategyTabs vault={vault} strategies={strategies} activeAllocs={activeAllocs} deployed={deployed} />

      {/* Vault Info */}
      <Card title="Vault Details" subtitle="">
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
          {[
            ['Vault ID', vault.vaultId],
            ['Credential', vault.credentialId],
            ['Client', vault.clientReference],
            ['Owner Wallet', vault.ownerWallet],
            ['Base Asset', vault.baseAsset],
            ['Status', vault.status],
            ['Created', new Date(vault.createdAt).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5">
              <span className="text-slate-500">{label}</span>
              <span className="text-ink-900 font-mono">{typeof value === 'string' && value.length > 20 ? truncate(value, 18) : value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-200">
          {vault.onChainAddress && (
            <a href={`https://solscan.io/account/${vault.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-teal-700 hover:underline">
              Vault PDA: {truncate(vault.onChainAddress)} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {vault.programId && (
            <a href={`https://solscan.io/account/${vault.programId}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-review-700 hover:underline">
              Program: {truncate(vault.programId)} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {vault.vaultAttestationPda && (
            <a href={`https://solscan.io/account/${vault.vaultAttestationPda}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-success-700 hover:underline">
              SAS: {truncate(vault.vaultAttestationPda)} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </Card>

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <Card title="Recent Activity" subtitle="">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Date</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Action</th>
                  <th className="text-right py-2.5 pr-3 font-semibold border-b border-slate-200">Amount</th>
                  <th className="text-left py-2.5 font-semibold border-b border-slate-200">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e: any, i: number) => (
                  <tr key={i} className={`hover:bg-teal-50 ${i < recentEvents.length - 1 ? 'border-b border-slate-200/60' : ''}`}>
                    <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{new Date(e.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2.5 pr-3 text-ink-900 capitalize">{(e.actionType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).replace(/\bUsdc\b/gi, 'USDC')}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-ink-900">{e.amount ? fmt(e.amount) : ''}</td>
                    <td className="py-2.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${e.result === 'success' ? 'bg-success-100 text-success-700' : e.result === 'pending' ? 'bg-warning-100 text-warning-700' : e.result === 'failure' || e.result === 'blocked' ? 'bg-error-100 text-error-700' : 'bg-slate-200 text-slate-500'}`}>
                        {e.result === 'pending' ? 'Pending Approval' : e.result}
                      </span>
                    </td>
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
