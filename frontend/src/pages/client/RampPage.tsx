import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction } from '@solana/spl-token';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import NotVerified from '../../components/NotVerified';
import { ArrowDown, ArrowDownToLine, ArrowUpFromLine, ExternalLink, RefreshCw, CheckCircle, Loader2, Banknote } from 'lucide-react';

const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const DEVNET_RPC = (import.meta as any).env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

function getBankBalance(): number {
  return parseFloat(sessionStorage.getItem('amina_bank_balance') || '50000');
}
function saveBankBalance(val: number) {
  sessionStorage.setItem('amina_bank_balance', val.toString());
}

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

type Step = 'idle' | 'processing' | 'confirming' | 'done' | 'error';

export default function RampPage() {
  const { notify, clientInfo } = useStore();
  const { publicKey, sendTransaction } = useWallet();
  if (!clientInfo?.credentialId) return <NotVerified />;

  const [tab, setTab] = useState<'onramp' | 'offramp'>('onramp');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [txSig, setTxSig] = useState<string | null>(null);
  const [aminaSender, setAminaSender] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [bankBal, setBankBal] = useState(getBankBalance());
  const [usdcBal, setUsdcBal] = useState<number | null>(null);

  const wallet = publicKey?.toBase58() || clientInfo?.walletAddress || '';
  const parsed = parseFloat(amount) || 0;

  useEffect(() => {
    if (!wallet) return;
    const conn = new Connection(DEVNET_RPC, 'confirmed');
    conn.getParsedTokenAccountsByOwner(new PublicKey(wallet), { mint: USDC_MINT })
      .then(r => setUsdcBal(r.value.length > 0 ? r.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0 : 0))
      .catch(() => setUsdcBal(0));
  }, [wallet, step]);

  const fromAsset = tab === 'onramp' ? 'USD' : 'USDC';
  const toAsset = tab === 'onramp' ? 'USDC' : 'USD';
  const fromBal = tab === 'onramp' ? bankBal : (usdcBal ?? 0);
  const toBal = tab === 'onramp' ? (usdcBal ?? 0) : bankBal;
  const canSubmit = parsed > 0 && parsed <= fromBal;
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankChecks, setBankChecks] = useState<{ label: string; status: 'pending' | 'pass' | 'fail' }[]>([]);
  const [bankApproved, setBankApproved] = useState(false);

  const runBankChecks = () => {
    setShowBankModal(true);
    setBankApproved(false);
    const checks = [
      { label: 'Account verification', status: 'pending' as const },
      { label: 'AML / KYC screening', status: 'pending' as const },
      { label: 'Transaction limit check', status: 'pending' as const },
      { label: 'Sanctions screening', status: 'pending' as const },
      { label: 'Source of funds check', status: 'pending' as const },
    ];
    setBankChecks([...checks]);

    // Simulate checks completing one by one
    checks.forEach((_, i) => {
      setTimeout(() => {
        setBankChecks(prev => prev.map((c, j) => j <= i ? { ...c, status: 'pass' } : c));
        if (i === checks.length - 1) setBankApproved(true);
      }, 800 * (i + 1));
    });
  };

  const handleInitSwap = () => {
    if (!canSubmit) return;
    if (tab === 'onramp') {
      runBankChecks();
    } else {
      executeSwap();
    }
  };

  const executeSwap = async () => {
    setShowBankModal(false);
    setStep('processing');
    setError('');
    setTxSig(null);
    setAminaSender(null);
    try {
      if (tab === 'onramp') {
        // Call backend: Amina Bank wallet sends USDC to user on-chain
        const result = await api.onramp(wallet, parsed);
        setTxSig(result.txSignature);
        setAminaSender(result.aminaWallet);

        const nb = bankBal - parsed;
        saveBankBalance(nb);
        setBankBal(nb);
      } else {
        // Off-ramp: user signs USDC transfer from their wallet to Amina's wallet
        if (!publicKey) throw new Error('Connect your wallet');

        const connection = new Connection(DEVNET_RPC, 'confirmed');
        // Fetch Amina Bank wallet from backend
        const { wallet: aminaAddr } = await api.getAminaWallet();
        const aminaPubkey = new PublicKey(aminaAddr);
        const amountLamports = BigInt(Math.round(parsed * 1e6));

        const userAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const aminaAta = await getAssociatedTokenAddress(USDC_MINT, aminaPubkey);

        const tx = new Transaction();
        tx.add(createAssociatedTokenAccountIdempotentInstruction(publicKey, aminaAta, aminaPubkey, USDC_MINT));
        tx.add(createTransferInstruction(userAta, aminaAta, publicKey, amountLamports));
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const sig = await sendTransaction(tx, connection);
        setTxSig(sig);
        setAminaSender(aminaPubkey.toBase58());

        // Poll for confirmation
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1500));
          const { value } = await connection.getSignatureStatuses([sig]);
          if (value[0]?.confirmationStatus === 'confirmed' || value[0]?.confirmationStatus === 'finalized') {
            if (value[0].err) throw new Error('Transaction failed on-chain');
            break;
          }
          if (i === 29) throw new Error('Not confirmed in 45s');
        }

        // Record in backend with tx signature
        await api.offramp(wallet, parsed, sig);

        const nb = bankBal + parsed;
        saveBankBalance(nb);
        setBankBal(nb);
      }
      setStep('done');
      notify('success', `${fmt(parsed)} ${fromAsset} → ${toAsset}`);
    } catch (e: any) {
      setError(e?.message || 'Failed');
      setStep('error');
    }
  };

  const reset = () => { setAmount(''); setStep('idle'); setError(''); setTxSig(null); setAminaSender(null); setShowBankModal(false); setBankApproved(false); };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display text-ink-900 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-teal-700" />
            On/Off Ramp
          </h1>
          <p className="text-xs text-slate-500 mt-1">Bridge between your bank account and crypto wallet</p>
        </div>
        <button onClick={() => { setBankBal(getBankBalance()); }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Bank Account (USD)</p>
          <p className="text-xl font-bold font-mono font-display text-ink-900">${fmt(bankBal)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Amina Bank fiat account</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Wallet (USDC)</p>
          <p className="text-xl font-bold font-mono font-display text-teal-700">{usdcBal !== null ? fmt(usdcBal) : '—'}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            On-chain balance
            {wallet && (
              <a href={`https://solscan.io/account/${wallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                className="ml-1.5 text-teal-700 hover:underline inline-flex items-center gap-0.5">
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </p>
        </div>
      </div>

      {/* Ramp Card */}
      <div className="bg-white border border-slate-200 rounded-[18px] overflow-hidden shadow-1">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button onClick={() => { setTab('onramp'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${tab === 'onramp' ? 'text-success-700 bg-success-100 border-b-2 border-success-700' : 'text-slate-500 hover:text-ink-900'}`}>
            <ArrowDownToLine className="w-3.5 h-3.5" /> On-Ramp (USD → USDC)
          </button>
          <button onClick={() => { setTab('offramp'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${tab === 'offramp' ? 'text-warning-700 bg-warning-100 border-b-2 border-warning-700' : 'text-slate-500 hover:text-ink-900'}`}>
            <ArrowUpFromLine className="w-3.5 h-3.5" /> Off-Ramp (USDC → USD)
          </button>
        </div>

        <div className="p-5">
          {/* Flow visual */}
          <div className="flex items-center justify-center gap-2 mb-5 text-[10px]">
            {tab === 'onramp' ? (
              <>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-ink-900 font-medium">Bank (USD)</span>
                <span className="text-slate-500">→</span>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-teal-700 font-medium">USDC Mint</span>
                <span className="text-slate-500">→</span>
                <span className="px-2.5 py-1 rounded-md bg-success-100 border border-success-700/20 text-success-700 font-medium">Wallet</span>
              </>
            ) : (
              <>
                <span className="px-2.5 py-1 rounded-md bg-warning-100 border border-warning-700/20 text-warning-700 font-medium">Wallet</span>
                <span className="text-slate-500">→</span>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-teal-700 font-medium">USDC Burn</span>
                <span className="text-slate-500">→</span>
                <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-ink-900 font-medium">Bank (USD)</span>
              </>
            )}
          </div>

          {step === 'idle' && (
            <>
              {/* Swap Card */}
              <div className="max-w-[280px] mx-auto">
                {/* From */}
                <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 font-medium">{tab === 'onramp' ? 'You pay' : 'You send'}</span>
                    <button onClick={() => setAmount(fromBal.toString())} className="text-[9px] text-slate-500 hover:text-ink-900 transition-colors">
                      Bal: {fmt(fromBal)} <span className={tab === 'onramp' ? 'text-success-700' : 'text-teal-700'}>{fromAsset}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="decimal" value={amount}
                      onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }}
                      placeholder="0.00"
                      className="w-full min-w-0 px-3 py-2 rounded-[12px] bg-white border border-slate-200 text-ink-900 text-sm font-mono font-semibold focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 transition-colors placeholder:text-slate-400" />
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 border flex-shrink-0 ${tab === 'onramp' ? 'bg-success-100 border-success-700/20' : 'bg-teal-100 border-teal-300/40'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${tab === 'onramp' ? 'bg-success-700 text-white' : 'bg-teal-700 text-white'}`}>
                        {tab === 'onramp' ? '$' : 'U'}
                      </div>
                      <span className={`text-[11px] font-semibold ${tab === 'onramp' ? 'text-success-700' : 'text-teal-700'}`}>{fromAsset}</span>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center -my-2.5 relative z-10">
                  <div className={`w-7 h-7 rounded-[12px] border-2 border-white flex items-center justify-center ${tab === 'onramp' ? 'bg-teal-700' : 'bg-success-700'}`}>
                    <ArrowDown className="w-3 h-3 text-white" />
                  </div>
                </div>

                {/* To */}
                <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500 font-medium">You receive</span>
                    <span className="text-[9px] text-slate-500">Bal: {fmt(toBal)} <span className={tab === 'onramp' ? 'text-teal-700' : 'text-success-700'}>{toAsset}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-full px-3 py-2 rounded-[12px] bg-white border border-slate-200 text-ink-900 text-sm font-mono font-semibold">
                      {parsed > 0 ? fmt(parsed) : <span className="text-slate-400">0.00</span>}
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 border flex-shrink-0 ${tab === 'onramp' ? 'bg-teal-100 border-teal-300/40' : 'bg-success-100 border-success-700/20'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${tab === 'onramp' ? 'bg-teal-700 text-white' : 'bg-success-700 text-white'}`}>
                        {tab === 'onramp' ? 'U' : '$'}
                      </div>
                      <span className={`text-[11px] font-semibold ${tab === 'onramp' ? 'text-teal-700' : 'text-success-700'}`}>{toAsset}</span>
                    </div>
                  </div>
                </div>

                {parsed > 0 && (
                  <div className="mt-2 px-0.5 space-y-0.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-500">Rate</span>
                      <span className="text-slate-500">1 <span className="text-success-700">USD</span> = 1 <span className="text-teal-700">USDC</span></span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-500">Fee</span>
                      <span className="text-success-700">Free</span>
                    </div>
                  </div>
                )}

                <button onClick={handleInitSwap} disabled={!canSubmit}
                  className={`w-full mt-3 py-2.5 rounded-[12px] text-xs font-semibold transition-all shadow-1 ${
                    canSubmit
                      ? 'bg-teal-700 hover:bg-teal-800 text-white'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}>
                  {parsed <= 0
                    ? 'Enter an amount'
                    : parsed > fromBal
                    ? `Insufficient ${fromAsset}`
                    : tab === 'onramp'
                    ? <><span className="text-teal-300">$</span> USD → <span className="text-teal-300">◈</span> USDC</>
                    : <><span className="text-teal-300">◈</span> USDC → <span className="text-teal-300">$</span> USD</>
                  }
                </button>
              </div>
            </>
          )}

          {/* Processing */}
          {(step === 'processing' || step === 'confirming') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm text-ink-900 font-medium">
                  {step === 'processing' ? `Converting ${fromAsset} to ${toAsset}...` : 'Confirming...'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 font-mono">{fmt(parsed)} {fromAsset} → {fmt(parsed)} {toAsset}</p>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="py-6 px-4 space-y-4">
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle className={`w-5 h-5 ${tab === 'onramp' ? 'text-success-700' : 'text-warning-700'}`} />
                <p className="text-sm text-ink-900 font-medium">Conversion Complete</p>
              </div>
              <p className="text-[11px] text-slate-500 text-center font-mono">{fmt(parsed)} {fromAsset} → {fmt(parsed)} {toAsset}</p>

              {/* On-chain transaction details */}
              {txSig && (
                <div className="bg-slate-100 rounded-[18px] p-3 space-y-2 text-xs">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">On-Chain Transaction</p>
                  {aminaSender && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sent by</span>
                      <a href={`https://solscan.io/account/${aminaSender}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="text-teal-700 hover:underline font-mono flex items-center gap-1">
                        {aminaSender.slice(0, 6)}...{aminaSender.slice(-4)} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transaction</span>
                    <a href={`https://solscan.io/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="text-teal-700 hover:underline font-mono flex items-center gap-1">
                      {txSig.slice(0, 8)}...{txSig.slice(-4)} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount</span>
                    <span className="text-teal-700 font-mono">{fmt(parsed)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className="text-success-700 font-medium">Confirmed</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-6 text-xs">
                <div className="text-center">
                  <p className="text-slate-500">Bank</p>
                  <p className="text-ink-900 font-mono font-medium">${fmt(bankBal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-500">Wallet</p>
                  <p className="text-ink-900 font-mono font-medium">{usdcBal !== null ? fmt(usdcBal) : '—'} USDC</p>
                </div>
              </div>
              <button onClick={reset}
                className="w-full py-2.5 rounded-[12px] text-xs font-medium bg-slate-100 text-slate-500 hover:text-ink-900 transition-colors">
                New Conversion
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <p className="text-sm text-error-700">{error}</p>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-ink-900">Try Again</button>
            </div>
          )}
        </div>
      </div>
      {/* Bank Payment Confirmation Modal — same style as vault mandate modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowBankModal(false)}>
          <div className="bg-white border border-slate-200 rounded-[24px] max-w-lg w-full flex flex-col shadow-3" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex-shrink-0">
              <h3 className="text-sm font-bold text-ink-900">Confirm Payment</h3>
              <p className="text-[10px] text-slate-500 mt-1">Review and approve this bank transfer</p>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="space-y-4 text-xs text-slate-500 leading-relaxed">
                {/* Amount */}
                <div className="text-center py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Transfer Amount</p>
                  <p className="text-2xl font-bold font-mono font-display text-ink-900">${fmt(parsed)}</p>
                  <p className="text-xs text-slate-500 mt-1">from Amina Bank Account → USDC Wallet</p>
                </div>

                {/* Transfer Details */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Transfer Details</p>
                  <div className="bg-slate-100 rounded-[18px] p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">From</span>
                      <span className="text-ink-900">Amina Bank Account (USD)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">To</span>
                      <span className="text-teal-700 font-mono">{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Currency</span>
                      <span className="text-teal-700">USDC (Solana)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Exchange Rate</span>
                      <span className="text-ink-900">1 <span className="text-success-700">USD</span> = 1 <span className="text-teal-700">USDC</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fee</span>
                      <span className="text-success-700">Waived</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2">
                      <span className="text-slate-500 font-semibold">Total Debit</span>
                      <span className="text-ink-900 font-mono font-semibold">${fmt(parsed)}</span>
                    </div>
                  </div>
                </div>

                {/* Compliance Verification */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Compliance Verification</p>
                  <div className="bg-slate-100 rounded-[18px] p-3 space-y-2">
                    {bankChecks.map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className={c.status === 'pass' ? 'text-ink-900' : 'text-slate-500'}>{c.label}</span>
                        {c.status === 'pass'
                          ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success-100 text-success-700">Passed</span>
                          : <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notice */}
                <div className="bg-warning-100 border border-warning-700/20 rounded-[18px] p-3">
                  <p className="text-[10px] text-warning-700">
                    By confirming, you authorise AMINA Bank to debit ${fmt(parsed)} from your fiat account and convert it to USDC stablecoin on the Solana blockchain.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex-shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowBankModal(false)}
                className="px-4 py-2 text-xs text-slate-500 hover:text-ink-900 transition-colors">
                Cancel
              </button>
              <button onClick={executeSwap} disabled={!bankApproved}
                className={`px-5 py-2 text-xs font-semibold rounded-[12px] transition-all flex items-center gap-1.5 shadow-1 ${
                  bankApproved ? 'bg-teal-700 hover:bg-teal-800 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}>
                {bankApproved ? 'Confirm Payment' : 'Verifying...'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
