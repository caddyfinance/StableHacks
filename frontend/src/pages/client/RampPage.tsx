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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-vault-accent" />
            On/Off Ramp
          </h1>
          <p className="text-xs text-vault-muted mt-1">Bridge between your bank account and crypto wallet</p>
        </div>
        <button onClick={() => { setBankBal(getBankBalance()); }}
          className="flex items-center gap-1.5 text-xs text-vault-muted hover:text-vault-accent transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Bank Account (USD)</p>
          <p className="text-xl font-bold font-mono text-white">${fmt(bankBal)}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">Amina Bank fiat account</p>
        </div>
        <div className="bg-vault-card border border-vault-border rounded-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">Wallet (USDC)</p>
          <p className="text-xl font-bold font-mono text-vault-accent">{usdcBal !== null ? fmt(usdcBal) : '—'}</p>
          <p className="text-[10px] text-vault-muted mt-0.5">
            On-chain balance
            {wallet && (
              <a href={`https://solscan.io/account/${wallet}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                className="ml-1.5 text-vault-accent hover:underline inline-flex items-center gap-0.5">
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </p>
        </div>
      </div>

      {/* Ramp Card */}
      <div className="bg-vault-card border border-vault-border rounded-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-vault-border">
          <button onClick={() => { setTab('onramp'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${tab === 'onramp' ? 'text-green-400 bg-green-500/5 border-b-2 border-green-400' : 'text-vault-muted hover:text-white'}`}>
            <ArrowDownToLine className="w-3.5 h-3.5" /> On-Ramp (USD → USDC)
          </button>
          <button onClick={() => { setTab('offramp'); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${tab === 'offramp' ? 'text-amber-400 bg-amber-500/5 border-b-2 border-amber-400' : 'text-vault-muted hover:text-white'}`}>
            <ArrowUpFromLine className="w-3.5 h-3.5" /> Off-Ramp (USDC → USD)
          </button>
        </div>

        <div className="p-5">
          {/* Flow visual */}
          <div className="flex items-center justify-center gap-2 mb-5 text-[10px]">
            {tab === 'onramp' ? (
              <>
                <span className="px-2.5 py-1 rounded-md bg-vault-bg border border-vault-border text-white font-medium">Bank (USD)</span>
                <span className="text-vault-muted">→</span>
                <span className="px-2.5 py-1 rounded-md bg-vault-bg border border-vault-border text-vault-accent font-medium">USDC Mint</span>
                <span className="text-vault-muted">→</span>
                <span className="px-2.5 py-1 rounded-md bg-green-900/20 border border-green-800/30 text-green-400 font-medium">Wallet</span>
              </>
            ) : (
              <>
                <span className="px-2.5 py-1 rounded-md bg-amber-900/20 border border-amber-800/30 text-amber-400 font-medium">Wallet</span>
                <span className="text-vault-muted">→</span>
                <span className="px-2.5 py-1 rounded-md bg-vault-bg border border-vault-border text-vault-accent font-medium">USDC Burn</span>
                <span className="text-vault-muted">→</span>
                <span className="px-2.5 py-1 rounded-md bg-vault-bg border border-vault-border text-white font-medium">Bank (USD)</span>
              </>
            )}
          </div>

          {step === 'idle' && (
            <>
              {/* Swap Card */}
              <div className="max-w-[280px] mx-auto">
                {/* From */}
                <div className="rounded-lg border border-vault-border bg-vault-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-vault-muted font-medium">{tab === 'onramp' ? 'You pay' : 'You send'}</span>
                    <button onClick={() => setAmount(fromBal.toString())} className="text-[9px] text-vault-muted hover:text-vault-text transition-colors">
                      Bal: {fmt(fromBal)} <span className={tab === 'onramp' ? 'text-emerald-400' : 'text-blue-400'}>{fromAsset}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="decimal" value={amount}
                      onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }}
                      placeholder="0.00"
                      className="w-full min-w-0 px-3 py-2 rounded bg-vault-bg border border-vault-border text-vault-text text-sm font-mono font-semibold focus:outline-none focus:border-vault-accent transition-colors placeholder:text-vault-muted/40" />
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 border flex-shrink-0 ${tab === 'onramp' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${tab === 'onramp' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                        {tab === 'onramp' ? '$' : 'U'}
                      </div>
                      <span className={`text-[11px] font-semibold ${tab === 'onramp' ? 'text-emerald-400' : 'text-blue-400'}`}>{fromAsset}</span>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center -my-2.5 relative z-10">
                  <div className={`w-7 h-7 rounded-lg border-2 border-vault-card flex items-center justify-center ${tab === 'onramp' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
                    <ArrowDown className="w-3 h-3 text-white" />
                  </div>
                </div>

                {/* To */}
                <div className="rounded-lg border border-vault-border bg-vault-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-vault-muted font-medium">You receive</span>
                    <span className="text-[9px] text-vault-muted">Bal: {fmt(toBal)} <span className={tab === 'onramp' ? 'text-blue-400' : 'text-emerald-400'}>{toAsset}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-full px-3 py-2 rounded bg-vault-bg border border-vault-border text-vault-text text-sm font-mono font-semibold">
                      {parsed > 0 ? fmt(parsed) : <span className="text-vault-muted/40">0.00</span>}
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 border flex-shrink-0 ${tab === 'onramp' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${tab === 'onramp' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'}`}>
                        {tab === 'onramp' ? 'U' : '$'}
                      </div>
                      <span className={`text-[11px] font-semibold ${tab === 'onramp' ? 'text-blue-400' : 'text-emerald-400'}`}>{toAsset}</span>
                    </div>
                  </div>
                </div>

                {parsed > 0 && (
                  <div className="mt-2 px-0.5 space-y-0.5">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-vault-muted">Rate</span>
                      <span className="text-vault-muted">1 <span className="text-emerald-400">USD</span> = 1 <span className="text-blue-400">USDC</span></span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-vault-muted">Fee</span>
                      <span className="text-emerald-400">Free</span>
                    </div>
                  </div>
                )}

                <button onClick={handleInitSwap} disabled={!canSubmit}
                  className={`w-full mt-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    canSubmit
                      ? 'bg-vault-accent hover:bg-blue-400 text-white'
                      : 'bg-vault-border text-vault-muted cursor-not-allowed'
                  }`}>
                  {parsed <= 0
                    ? 'Enter an amount'
                    : parsed > fromBal
                    ? `Insufficient ${fromAsset}`
                    : tab === 'onramp'
                    ? <><span className="text-emerald-300">$</span> USD → <span className="text-blue-300">◈</span> USDC</>
                    : <><span className="text-blue-300">◈</span> USDC → <span className="text-emerald-300">$</span> USD</>
                  }
                </button>
              </div>
            </>
          )}

          {/* Processing */}
          {(step === 'processing' || step === 'confirming') && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full bg-vault-bg flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-vault-accent animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm text-white font-medium">
                  {step === 'processing' ? `Converting ${fromAsset} to ${toAsset}...` : 'Confirming...'}
                </p>
                <p className="text-[11px] text-vault-muted mt-1 font-mono">{fmt(parsed)} {fromAsset} → {fmt(parsed)} {toAsset}</p>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="py-6 px-4 space-y-4">
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle className={`w-5 h-5 ${tab === 'onramp' ? 'text-green-400' : 'text-amber-400'}`} />
                <p className="text-sm text-white font-medium">Conversion Complete</p>
              </div>
              <p className="text-[11px] text-vault-muted text-center font-mono">{fmt(parsed)} {fromAsset} → {fmt(parsed)} {toAsset}</p>

              {/* On-chain transaction details */}
              {txSig && (
                <div className="bg-vault-bg rounded-lg p-3 space-y-2 text-xs">
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">On-Chain Transaction</p>
                  {aminaSender && (
                    <div className="flex justify-between">
                      <span className="text-vault-muted">Sent by</span>
                      <a href={`https://solscan.io/account/${aminaSender}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                        className="text-vault-accent hover:underline font-mono flex items-center gap-1">
                        {aminaSender.slice(0, 6)}...{aminaSender.slice(-4)} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-vault-muted">Transaction</span>
                    <a href={`https://solscan.io/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                      className="text-vault-accent hover:underline font-mono flex items-center gap-1">
                      {txSig.slice(0, 8)}...{txSig.slice(-4)} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-vault-muted">Amount</span>
                    <span className="text-blue-400 font-mono">{fmt(parsed)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-vault-muted">Status</span>
                    <span className="text-emerald-400 font-medium">Confirmed</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-6 text-xs">
                <div className="text-center">
                  <p className="text-vault-muted">Bank</p>
                  <p className="text-white font-mono font-medium">${fmt(bankBal)}</p>
                </div>
                <div className="text-center">
                  <p className="text-vault-muted">Wallet</p>
                  <p className="text-white font-mono font-medium">{usdcBal !== null ? fmt(usdcBal) : '—'} USDC</p>
                </div>
              </div>
              <button onClick={reset}
                className="w-full py-2.5 rounded-lg text-xs font-medium bg-vault-bg text-vault-muted hover:text-white transition-colors">
                New Conversion
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={reset} className="text-xs text-vault-muted hover:text-white">Try Again</button>
            </div>
          )}
        </div>
      </div>
      {/* Bank Payment Confirmation Modal — same style as vault mandate modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowBankModal(false)}>
          <div className="bg-[#111827] border border-vault-border rounded-xl max-w-lg w-full flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-vault-border flex-shrink-0">
              <h3 className="text-sm font-bold text-white">Confirm Payment</h3>
              <p className="text-[10px] text-vault-muted mt-1">Review and approve this bank transfer</p>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="space-y-4 text-xs text-vault-muted leading-relaxed">
                {/* Amount */}
                <div className="text-center py-3">
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold mb-2">Transfer Amount</p>
                  <p className="text-2xl font-bold font-mono text-white">${fmt(parsed)}</p>
                  <p className="text-xs text-vault-muted mt-1">from Amina Bank Account → USDC Wallet</p>
                </div>

                {/* Transfer Details */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold mb-2">Transfer Details</p>
                  <div className="bg-vault-bg rounded-lg p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-vault-muted">From</span>
                      <span className="text-white">Amina Bank Account (USD)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-vault-muted">To</span>
                      <span className="text-blue-400 font-mono">{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-vault-muted">Currency</span>
                      <span className="text-blue-400">USDC (Solana)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-vault-muted">Exchange Rate</span>
                      <span className="text-white">1 <span className="text-emerald-400">USD</span> = 1 <span className="text-blue-400">USDC</span></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-vault-muted">Fee</span>
                      <span className="text-emerald-400">Waived</span>
                    </div>
                    <div className="flex justify-between border-t border-vault-border pt-2">
                      <span className="text-vault-muted font-semibold">Total Debit</span>
                      <span className="text-white font-mono font-semibold">${fmt(parsed)}</span>
                    </div>
                  </div>
                </div>

                {/* Compliance Verification */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold mb-2">Compliance Verification</p>
                  <div className="bg-vault-bg rounded-lg p-3 space-y-2">
                    {bankChecks.map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className={c.status === 'pass' ? 'text-vault-text' : 'text-vault-muted'}>{c.label}</span>
                        {c.status === 'pass'
                          ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400">Passed</span>
                          : <Loader2 className="w-3 h-3 text-vault-muted animate-spin" />
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notice */}
                <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3">
                  <p className="text-[10px] text-amber-400">
                    By confirming, you authorise AMINA Bank to debit ${fmt(parsed)} from your fiat account and convert it to USDC stablecoin on the Solana blockchain.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-vault-border flex-shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowBankModal(false)}
                className="px-4 py-2 text-xs text-vault-muted hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={executeSwap} disabled={!bankApproved}
                className={`px-5 py-2 text-xs font-semibold rounded transition-all flex items-center gap-1.5 ${
                  bankApproved ? 'bg-vault-accent hover:bg-blue-400 text-white' : 'bg-vault-border text-vault-muted cursor-not-allowed'
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
