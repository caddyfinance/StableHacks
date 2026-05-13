import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import {
  RefreshCw, ExternalLink, Search, Eye, ChevronDown, ChevronUp,
  ShieldCheck, Wallet, ArrowRight, ArrowDownToLine, ArrowUpFromLine, TrendingUp,
  Building2, Lock, CheckCircle, Copy, ArrowLeft, Timer,
  Link2, AlertCircle, Shield, Globe,
} from 'lucide-react';

interface DepositEntry {
  amount: number;
  sourceWallet: string;
  sourceReference: string;
  sourceType: string;
  screeningStatus: string;
  jurisdictionTag: string;
  createdAt: string;
  onChainVerified: boolean;
}

interface AllocationEntry {
  strategyName: string;
  strategyId: string;
  amount: number;
  yieldAccrued: number;
  onChainYield?: number;
  status: string;
  txSignature?: string;
  onChainAddress?: string;
  createdAt: string;
  onChainVerified: boolean;
}

interface EventEntry {
  eventId: string;
  actionType: string;
  amount?: number;
  result: string;
  txSignature?: string;
  onChainAddress?: string;
  compliancePda?: string;
  travelRulePda?: string;
  routingPda?: string;
  glEntryPda?: string;
  translationLayerRef?: string;
  timestamp: string;
  onChainVerified: boolean;
}

interface WithdrawalEntry {
  amount: number;
  destinationWallet: string;
  requestId: string;
  status: string;
  txSignature?: string;
  approvedAt?: string;
}

interface SolsticePosition {
  eusxBalance: number;
  usxValue: number;
  exchangeRate: number;
  vaultAllocatedAmount: number;
  onChainYield: number;
}

interface OnChainVerification {
  vaultPdaExists: boolean;
  vaultPda: string | null;
  programExists: boolean;
  programExecutable: boolean;
  vaultDataLength: number | null;
  ownerWalletBalance: number;
  bankWalletBalance: number;
  bankWallet: string;
}

interface VaultEntry {
  vaultId: string;
  clientReference: string;
  baseAsset: string;
  status: string;
  paused: boolean;
  idleBalance: number;
  totalDeposited: number;
  totalNAV: number;
  totalWithdrawn?: number;
  onChainAddress?: string;
  programId?: string;
  programVerified?: boolean;
  createdAt: string;
  onChainVerification: OnChainVerification | null;
  binaryVerification?: { verified: boolean; binaryMatch: boolean; patchedOffsets: number; error: string | null } | null;
  credential: {
    credentialId: string;
    clientReference: string;
    jurisdiction: string;
    riskTier: string;
    attestationPda?: string;
  };
  deposits: DepositEntry[];
  allocations: AllocationEntry[];
  withdrawals?: WithdrawalEntry[];
  solsticePosition?: SolsticePosition | null;
  recentEvents: EventEntry[];
}

interface OwnerGroup {
  ownerWallet: string;
  vaultCount: number;
  totalDeposited: number;
  totalNAV: number;
  vaults: VaultEntry[];
}

interface TransparencyData {
  aminaWallet: string;
  bankWalletOnChainBalance: number;
  totalVaults: number;
  totalDeposited: number;
  totalNAV: number;
  vaultsByOwner: OwnerGroup[];
}

const fmt = (v: number) =>
  v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const truncate = (s: string, len = 14) =>
  s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso || '\u2014'; }
};

const actionLabel = (at: string) =>
  at?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '\u2014';

const EXPLORER_BASE = 'https://explorer.solana.com';
const explorerLink = (sig: string) => `${EXPLORER_BASE}/tx/${sig}?cluster=devnet`;
const addrLink = (addr: string) => `${EXPLORER_BASE}/address/${addr}?cluster=devnet`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="text-slate-400 hover:text-teal-700 transition-colors ml-1" title="Copy">
      {copied ? <CheckCircle className="w-3 h-3 text-success-700" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function OnChainBadge({ verified, label }: { verified: boolean; label?: string }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-success-100 text-success-700 border border-success-700/20 font-semibold">
      <CheckCircle className="w-2.5 h-2.5" /> {label || 'On-Chain'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
      DB Only
    </span>
  );
}

function FlowNode({ icon: Icon, label, sublabel, color, href, address, verified }: {
  icon: any; label: string; sublabel?: string; color: string; href?: string; address?: string; verified?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: 'bg-success-100 border-success-700/30 text-success-700',
    teal: 'bg-teal-100 border-teal-300/40 text-teal-700',
    blue: 'bg-info-100 border-info-700/30 text-info-700',
    orange: 'bg-warning-100 border-warning-700/30 text-warning-700',
    slate: 'bg-slate-100 border-slate-300 text-slate-600',
  };
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 min-w-[130px] text-center ${colorMap[color] || colorMap.slate}`}>
      <div className="flex items-center justify-center gap-1">
        <Icon className="w-4 h-4" />
        {verified && <CheckCircle className="w-2.5 h-2.5 text-success-700" />}
      </div>
      <p className="text-[11px] font-semibold leading-tight">{label}</p>
      {sublabel && <p className="text-[10px] opacity-70 mt-0.5 font-mono">{sublabel}</p>}
      {address && (
        <div className="flex items-center justify-center gap-1 mt-1">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="text-[9px] font-mono hover:underline">{truncate(address, 12)}</a>
          ) : (
            <span className="text-[9px] font-mono">{truncate(address, 12)}</span>
          )}
          <CopyButton text={address} />
        </div>
      )}
    </div>
  );
}

function FlowConnector({ label, amount, reverse }: { label?: string; amount?: string; reverse?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-1">
      <div className="flex items-center gap-1">
        <div className={`w-8 h-px ${reverse ? 'bg-warning-700/40' : 'bg-slate-300'}`} />
        {reverse
          ? <ArrowLeft className="w-3.5 h-3.5 text-warning-700/60" />
          : <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        }
        <div className={`w-8 h-px ${reverse ? 'bg-warning-700/40' : 'bg-slate-300'}`} />
      </div>
      {(label || amount) && (
        <div className="text-center mt-0.5">
          {amount && <p className={`text-[10px] font-mono font-semibold ${reverse ? 'text-warning-700' : 'text-ink-900'}`}>{amount}</p>}
          {label && <p className={`text-[9px] ${reverse ? 'text-warning-700/70' : 'text-slate-400'}`}>{label}</p>}
        </div>
      )}
    </div>
  );
}

function VaultCard({ vault, aminaWallet }: { vault: VaultEntry; aminaWallet: string }) {
  const [expanded, setExpanded] = useState(false);
  const oc = vault.onChainVerification;
  const bv = vault.binaryVerification;
  const isOnChainVerified = oc?.vaultPdaExists || !!vault.onChainAddress;
  const isProgramVerified = bv?.verified ?? !!(oc?.programExists && oc?.programExecutable);

  const onChainDeposits = vault.deposits.filter(d => d.onChainVerified);
  const onChainAllocations = vault.allocations.filter(a => a.onChainVerified);
  const onChainEvents = vault.recentEvents.filter(e => e.onChainVerified);
  const deployedAllocations = onChainAllocations.filter(a => a.status === 'active' || a.status === 'cooldown');
  const cooldownAllocations = onChainAllocations.filter(a => a.status === 'cooldown');
  const unwoundAllocations = onChainAllocations.filter(a => a.status === 'unwound');
  const totalDeployed = deployedAllocations.reduce((s, a) => s + (a.amount || 0), 0);
  const totalYield = onChainAllocations.reduce((s, a) => s + (a.yieldAccrued || 0) + (a.onChainYield || 0), 0);
  const totalWithdrawn = vault.totalWithdrawn || 0;
  const totalPendingWithdrawal = (vault as any).totalPendingWithdrawal || 0;
  const uniqueSourceWallets = [...new Set(onChainDeposits.map(d => d.sourceWallet))];
  const approvedWithdrawals = (vault.withdrawals || []).filter(w => w.status === 'approved');
  const pendingWithdrawals = (vault.withdrawals || []).filter(w => w.status === 'pending');
  const uniqueDestWallets = [...new Set(approvedWithdrawals.map(w => w.destinationWallet).filter(Boolean))];
  const hasWithdrawalActivity = totalWithdrawn > 0 || totalPendingWithdrawal > 0 || unwoundAllocations.length > 0 || cooldownAllocations.length > 0 || pendingWithdrawals.length > 0;

  return (
    <div className="border border-slate-200 rounded-[14px] bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${isOnChainVerified ? 'bg-teal-100 border border-teal-300/40' : 'bg-slate-100 border border-slate-200'} flex items-center justify-center`}>
            <Lock className={`w-3.5 h-3.5 ${isOnChainVerified ? 'text-teal-700' : 'text-slate-500'}`} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink-900 font-mono">{vault.vaultId}</span>
              <StatusBadge status={vault.paused ? 'paused' : vault.status} />
              {isOnChainVerified && <OnChainBadge verified />}
            </div>
            <p className="text-[11px] text-slate-500">
              {vault.clientReference} &middot; {vault.credential.jurisdiction} &middot; {vault.credential.riskTier}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-400">On-Chain NAV</p>
            <p className="text-sm font-mono font-semibold text-teal-700">${fmt(vault.totalNAV)}</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-5 space-y-5 bg-slate-50/50">

          {/* On-Chain Verification Status */}
          {oc && (
            <div className="bg-white border border-slate-200 rounded-[12px] p-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">On-Chain Verification</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`rounded-md p-2.5 text-center border ${oc.vaultPdaExists ? 'bg-success-50 border-success-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {oc.vaultPdaExists ? <CheckCircle className="w-3.5 h-3.5 text-success-700" /> : <AlertCircle className="w-3.5 h-3.5 text-slate-400" />}
                    <p className="text-[10px] font-semibold text-ink-900">Vault PDA</p>
                  </div>
                  <p className="text-[9px] font-mono text-slate-500">{oc.vaultPda ? truncate(oc.vaultPda, 16) : 'Not found'}</p>
                  {oc.vaultPda && <a href={addrLink(oc.vaultPda)} target="_blank" rel="noreferrer" className="text-[8px] text-teal-700 hover:underline block mt-0.5">View on Explorer</a>}
                </div>
                <div className={`rounded-md p-2.5 text-center border ${oc.programExists ? 'bg-success-50 border-success-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {oc.programExists ? <CheckCircle className="w-3.5 h-3.5 text-success-700" /> : <AlertCircle className="w-3.5 h-3.5 text-slate-400" />}
                    <p className="text-[10px] font-semibold text-ink-900">Program</p>
                  </div>
                  <p className="text-[9px] font-mono text-slate-500">{vault.programId ? truncate(vault.programId, 16) : 'Not deployed'}</p>
                  {oc.programExecutable && <p className="text-[8px] text-success-700 font-medium mt-0.5">Executable</p>}
                </div>
                <div className={`rounded-md p-2.5 text-center border ${oc.vaultPdaExists ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-semibold text-ink-900 mb-1">Data Size</p>
                  <p className="text-sm font-mono text-ink-900">{oc.vaultDataLength || 0} bytes</p>
                  <p className="text-[8px] text-slate-400 mt-0.5">On-chain account data</p>
                </div>
                <div className="rounded-md p-2.5 text-center border bg-slate-50 border-slate-200">
                  <p className="text-[10px] font-semibold text-ink-900 mb-1">Bank Balance</p>
                  <p className="text-sm font-mono text-ink-900">${fmt(oc.bankWalletBalance)}</p>
                  <p className="text-[8px] text-slate-400 mt-0.5">On-chain USDC custody</p>
                </div>
              </div>
            </div>
          )}

          {/* Fund Flow Graph - only on-chain verified flows */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">On-Chain Fund Flow</p>
            <div className="bg-white border border-slate-200 rounded-[14px] p-5 overflow-x-auto space-y-4">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-success-700 font-semibold mb-2 flex items-center gap-1">
                  <ArrowDownToLine className="w-3 h-3" /> Deposit Flow
                </p>
                <div className="flex items-center gap-1 min-w-[700px]">
                  <div className="flex flex-col gap-2 shrink-0">
                    {uniqueSourceWallets.length > 0 ? uniqueSourceWallets.map((w, i) => {
                      const deposits = onChainDeposits.filter(d => d.sourceWallet === w);
                      const total = deposits.reduce((s, d) => s + d.amount, 0);
                      return (
                        <FlowNode key={i} icon={Wallet} label="Source Wallet" sublabel={`$${fmt(total)}`}
                          color="green" address={w} href={addrLink(w)} verified />
                      );
                    }) : (
                      <FlowNode icon={Wallet} label="No On-Chain Deposits" color="slate" />
                    )}
                  </div>

                  <FlowConnector label="Deposit" amount={vault.totalDeposited > 0 ? `$${fmt(vault.totalDeposited)}` : undefined} />

                  <FlowNode icon={Building2} label="AMINA Bank" sublabel={`$${fmt(oc?.bankWalletBalance || 0)} on-chain`}
                    color="teal" address={aminaWallet} href={addrLink(aminaWallet)} verified />

                  <FlowConnector label="Segregated" />

                  <FlowNode icon={Lock} label={vault.vaultId} sublabel={`NAV: $${fmt(vault.totalNAV)}`}
                    color="teal"
                    address={oc?.vaultPda || vault.onChainAddress || undefined}
                    href={(oc?.vaultPda || vault.onChainAddress) ? addrLink(oc?.vaultPda || vault.onChainAddress!) : undefined}
                    verified={isOnChainVerified} />

                  {deployedAllocations.length > 0 && (
                    <>
                      <FlowConnector label="Deploy" amount={totalDeployed > 0 ? `$${fmt(totalDeployed)}` : undefined} />
                      <div className="flex flex-col gap-2 shrink-0">
                        {deployedAllocations.map((a, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <FlowNode icon={a.status === 'cooldown' ? Timer : TrendingUp}
                              label={a.strategyName.length > 20 ? a.strategyName.slice(0, 18) + '...' : a.strategyName}
                              sublabel={`$${fmt(a.amount)}${(a.onChainYield || 0) > 0 ? ` (+${fmt(a.onChainYield || 0)} yield)` : (a.yieldAccrued > 0 ? ` (+${fmt(a.yieldAccrued)})` : '')}${a.status === 'cooldown' ? ' [cooldown]' : ''}`}
                              color={a.status === 'cooldown' ? 'orange' : 'blue'}
                              address={a.onChainAddress || undefined} href={a.onChainAddress ? addrLink(a.onChainAddress) : undefined}
                              verified />
                            {a.txSignature && (
                              <a href={explorerLink(a.txSignature)} target="_blank" rel="noreferrer"
                                className="text-slate-400 hover:text-teal-700 shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {vault.solsticePosition && vault.solsticePosition.vaultAllocatedAmount > 0 && (
                    <div className="ml-2 bg-info-100 border border-info-700/20 rounded-[10px] px-2.5 py-1.5 text-[10px] text-info-700 shrink-0">
                      <p className="font-semibold flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> On-Chain Position</p>
                      <p className="font-mono">{vault.solsticePosition.eusxBalance.toFixed(4)} eUSX</p>
                      <p className="font-mono text-[9px]">{'\u2248'}${fmt(vault.solsticePosition.usxValue)}</p>
                      <p className="text-[9px] opacity-70">Rate: {vault.solsticePosition.exchangeRate.toFixed(6)}</p>
                      <p className="text-[9px] font-medium mt-1">Deployed: ${fmt(vault.solsticePosition.vaultAllocatedAmount)}</p>
                      {vault.solsticePosition.onChainYield > 0 && (
                        <p className="text-[9px] text-success-700 font-medium">Yield: +${fmt(vault.solsticePosition.onChainYield)}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {hasWithdrawalActivity && (
                <div>
                  <div className="border-t border-slate-200 my-3" />
                  <p className="text-[9px] uppercase tracking-wider text-warning-700 font-semibold mb-2 flex items-center gap-1">
                    <ArrowUpFromLine className="w-3 h-3" /> Withdrawal Flow
                  </p>
                  <div className="flex items-center gap-1 min-w-[700px]">
                    <div className="flex flex-col gap-2 shrink-0">
                      {cooldownAllocations.map((a, i) => (
                        <div key={`cd-${i}`} className="flex items-center gap-2">
                          <FlowNode icon={Timer}
                            label={a.strategyName.length > 18 ? a.strategyName.slice(0, 16) + '...' : a.strategyName}
                            sublabel={`$${fmt(a.amount)} cooldown`}
                            color="orange"
                            address={a.onChainAddress || undefined} href={a.onChainAddress ? addrLink(a.onChainAddress) : undefined}
                            verified />
                          {a.txSignature && (
                            <a href={explorerLink(a.txSignature)} target="_blank" rel="noreferrer"
                              className="text-slate-400 hover:text-teal-700 shrink-0"><ExternalLink className="w-3 h-3" /></a>
                          )}
                        </div>
                      ))}
                      {unwoundAllocations.map((a, i) => (
                        <div key={`uw-${i}`} className="flex items-center gap-2">
                          <FlowNode icon={TrendingUp}
                            label={a.strategyName.length > 18 ? a.strategyName.slice(0, 16) + '...' : a.strategyName}
                            sublabel={`$${fmt(a.amount)} unwound`}
                            color="green"
                            address={a.onChainAddress || undefined} href={a.onChainAddress ? addrLink(a.onChainAddress) : undefined}
                            verified />
                          {a.txSignature && (
                            <a href={explorerLink(a.txSignature)} target="_blank" rel="noreferrer"
                              className="text-slate-400 hover:text-teal-700 shrink-0"><ExternalLink className="w-3 h-3" /></a>
                          )}
                        </div>
                      ))}
                      {cooldownAllocations.length === 0 && unwoundAllocations.length === 0 && (
                        <FlowNode icon={TrendingUp} label="No Unwinds" sublabel="Direct withdrawal" color="slate" />
                      )}
                    </div>

                    <FlowConnector label="Unwind" />

                    <FlowNode icon={Lock} label={vault.vaultId} sublabel={`NAV: $${fmt(vault.totalNAV)}`}
                      color="teal"
                      address={oc?.vaultPda || vault.onChainAddress || undefined}
                      href={(oc?.vaultPda || vault.onChainAddress) ? addrLink(oc?.vaultPda || vault.onChainAddress!) : undefined}
                      verified={isOnChainVerified} />

                    <FlowConnector label="Release" />

                    <FlowNode icon={Building2} label="AMINA Bank" sublabel="Custodian"
                      color="teal" address={aminaWallet} href={addrLink(aminaWallet)} verified />

                    <FlowConnector label="Withdraw"
                      amount={(totalWithdrawn + totalPendingWithdrawal) > 0 ? `$${fmt(totalWithdrawn + totalPendingWithdrawal)}` : undefined} />

                    <div className="flex flex-col gap-2 shrink-0">
                      {uniqueDestWallets.map((w, i) => {
                        const total = approvedWithdrawals.filter(wd => wd.destinationWallet === w).reduce((s, wd) => s + wd.amount, 0);
                        return (
                          <FlowNode key={`ap-${i}`} icon={Wallet} label="Client Wallet" sublabel={`$${fmt(total)} sent`}
                            color="green" address={w} href={addrLink(w)} verified />
                        );
                      })}
                      {pendingWithdrawals.map((w, i) => (
                        <FlowNode key={`pd-${i}`} icon={Timer} label="Pending Approval" sublabel={`$${fmt(w.amount)}`}
                          color="orange" address={w.destinationWallet || undefined} href={w.destinationWallet ? addrLink(w.destinationWallet) : undefined} />
                      ))}
                      {uniqueDestWallets.length === 0 && pendingWithdrawals.length === 0 && (
                        <FlowNode icon={Wallet} label="Awaiting" sublabel="No withdrawals yet" color="slate" />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* On-Chain Summary Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">On-Chain Deposits</p>
              <p className="text-sm font-mono font-semibold text-ink-900">{onChainDeposits.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Deployed</p>
              <p className="text-sm font-mono font-semibold text-teal-700">${fmt(totalDeployed)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Yield (on-chain)</p>
              <p className="text-sm font-mono font-semibold text-success-700">+${fmt(totalYield)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Withdrawn</p>
              <p className="text-sm font-mono font-semibold text-warning-700">${fmt(totalWithdrawn)}</p>
              {totalPendingWithdrawal > 0 && <p className="text-[10px] font-mono text-warning-700/70">+${fmt(totalPendingWithdrawal)} pending</p>}
            </div>
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Idle</p>
              <p className="text-sm font-mono font-semibold text-ink-900">${fmt(vault.idleBalance)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 text-center">
              <p className="text-[10px] text-slate-400 uppercase">NAV</p>
              <p className="text-sm font-mono font-semibold text-teal-700">${fmt(vault.totalNAV)}</p>
            </div>
          </div>

          {/* On-Chain Addresses */}
          {(oc?.vaultPda || vault.onChainAddress || vault.programId || vault.credential.attestationPda) && (
            <div className="flex flex-wrap gap-4 text-[11px]">
              {oc?.vaultPda && (
                <div className="flex items-center gap-1">
                  <OnChainBadge verified label="Vault PDA" />
                  <a href={addrLink(oc.vaultPda)} target="_blank" rel="noreferrer"
                    className="font-mono text-teal-700 hover:underline">{truncate(oc.vaultPda, 20)}</a>
                  <CopyButton text={oc.vaultPda} />
                </div>
              )}
              {!oc?.vaultPda && vault.onChainAddress && (
                <div className="flex items-center gap-1">
                  <OnChainBadge verified label="Vault PDA" />
                  <a href={addrLink(vault.onChainAddress)} target="_blank" rel="noreferrer"
                    className="font-mono text-teal-700 hover:underline">{truncate(vault.onChainAddress, 20)}</a>
                  <CopyButton text={vault.onChainAddress} />
                </div>
              )}
              {vault.programId && (
                <div className="flex items-center gap-1">
                  <OnChainBadge verified={isProgramVerified} label="Program" />
                  <a href={addrLink(vault.programId)} target="_blank" rel="noreferrer"
                    className="font-mono text-teal-700 hover:underline">{truncate(vault.programId, 20)}</a>
                  <CopyButton text={vault.programId} />
                </div>
              )}
              {vault.credential.attestationPda && (
                <div className="flex items-center gap-1">
                  <OnChainBadge verified label="SAS Attestation" />
                  <a href={addrLink(vault.credential.attestationPda)} target="_blank" rel="noreferrer"
                    className="font-mono text-teal-700 hover:underline">{truncate(vault.credential.attestationPda, 20)}</a>
                  <CopyButton text={vault.credential.attestationPda} />
                </div>
              )}
            </div>
          )}

          {/* On-Chain Verified Events Only */}
          {onChainEvents.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                On-Chain Activity <span className="font-normal text-slate-400">({onChainEvents.length} verified of {vault.recentEvents.length} total)</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="text-left py-1.5 pr-3 font-semibold border-b border-slate-200">Time</th>
                      <th className="text-left py-1.5 pr-3 font-semibold border-b border-slate-200">Action</th>
                      <th className="text-right py-1.5 pr-3 font-semibold border-b border-slate-200">Amount</th>
                      <th className="text-left py-1.5 pr-3 font-semibold border-b border-slate-200">Result</th>
                      <th className="text-left py-1.5 pr-3 font-semibold border-b border-slate-200">On-Chain PDAs</th>
                      <th className="text-right py-1.5 font-semibold border-b border-slate-200">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onChainEvents.map((e, i) => (
                      <tr key={i} className="hover:bg-white border-b border-slate-200/50 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{fmtTime(e.timestamp)}</td>
                        <td className="py-1.5 pr-3 text-ink-900">{actionLabel(e.actionType)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{e.amount ? `$${fmt(e.amount)}` : '\u2014'}</td>
                        <td className="py-1.5 pr-3"><StatusBadge status={e.result} /></td>
                        <td className="py-1.5 pr-3">
                          <div className="flex gap-1 flex-wrap">
                            {e.compliancePda && (
                              <a href={addrLink(e.compliancePda)} target="_blank" rel="noreferrer" className="text-[9px] px-1 py-0.5 bg-teal-50 text-teal-700 rounded font-mono hover:underline border border-teal-200">
                                <Shield className="w-2 h-2 inline mr-0.5" />Compliance
                              </a>
                            )}
                            {e.travelRulePda && (
                              <a href={addrLink(e.travelRulePda)} target="_blank" rel="noreferrer" className="text-[9px] px-1 py-0.5 bg-blue-50 text-blue-700 rounded font-mono hover:underline border border-blue-200">
                                <Globe className="w-2 h-2 inline mr-0.5" />Travel Rule
                              </a>
                            )}
                            {e.routingPda && (
                              <a href={addrLink(e.routingPda)} target="_blank" rel="noreferrer" className="text-[9px] px-1 py-0.5 bg-purple-50 text-purple-700 rounded font-mono hover:underline border border-purple-200">
                                Routing
                              </a>
                            )}
                            {e.glEntryPda && (
                              <a href={addrLink(e.glEntryPda)} target="_blank" rel="noreferrer" className="text-[9px] px-1 py-0.5 bg-slate-50 text-slate-700 rounded font-mono hover:underline border border-slate-200">
                                <Building2 className="w-2 h-2 inline mr-0.5" />GL Entry
                              </a>
                            )}
                            {!e.compliancePda && !e.travelRulePda && !e.routingPda && !e.glEntryPda && (
                              <span className="text-[9px] text-slate-400">{'\u2014'}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 text-right">
                          {e.txSignature ? (
                            <a href={explorerLink(e.txSignature)} target="_blank" rel="noreferrer"
                              className="text-teal-700 hover:underline font-mono">{truncate(e.txSignature, 12)}</a>
                          ) : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {onChainEvents.length === 0 && vault.recentEvents.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-center">
              <p className="text-[10px] text-slate-500">{vault.recentEvents.length} events recorded but none have on-chain proof (tx signature) yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TransparencyPage() {
  const { notify } = useStore();
  const [data, setData] = useState<TransparencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getTransparency();
      setData(res);
      setExpandedOwners(new Set(res.vaultsByOwner.map((o: OwnerGroup) => o.ownerWallet)));
    } catch (err: any) {
      notify('error', err?.message || 'Failed to load transparency data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.vaultsByOwner;
    const q = search.toLowerCase();
    return data.vaultsByOwner
      .map((group) => ({
        ...group,
        vaults: group.vaults.filter((v) =>
          v.vaultId.toLowerCase().includes(q) ||
          v.clientReference.toLowerCase().includes(q) ||
          v.credential.credentialId.toLowerCase().includes(q) ||
          group.ownerWallet.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.vaults.length > 0);
  }, [data, search]);

  const toggleOwner = (wallet: string) => {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(wallet)) next.delete(wallet);
      else next.add(wallet);
      return next;
    });
  };

  const totalOnChainEvents = useMemo(() => {
    if (!data) return 0;
    return data.vaultsByOwner.reduce((acc, g) =>
      acc + g.vaults.reduce((va, v) => va + v.recentEvents.filter(e => e.onChainVerified).length, 0), 0);
  }, [data]);

  const totalEvents = useMemo(() => {
    if (!data) return 0;
    return data.vaultsByOwner.reduce((acc, g) =>
      acc + g.vaults.reduce((va, v) => va + v.recentEvents.length, 0), 0);
  }, [data]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-slate-500">
        <p>Failed to load transparency data.</p>
        <button onClick={load} className="mt-3 text-teal-700 hover:underline text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-full bg-teal-100 border border-teal-300/40 flex items-center justify-center">
              <Eye className="w-4.5 h-4.5 text-teal-700" />
            </div>
            <h1 className="text-xl font-bold text-ink-900">Fund Segregation &amp; Transparency</h1>
          </div>
          <p className="text-sm text-slate-500 ml-[46px]">
            All data verified on-chain. Only on-chain executed transactions and balances are shown.
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-[10px] text-xs text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* KPI Summary - On-Chain Verified */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card title="" subtitle="">
          <div className="text-center py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">AMINA Custody Wallet</p>
            <div className="flex items-center justify-center gap-1">
              <OnChainBadge verified label="On-Chain" />
              <a href={addrLink(data.aminaWallet)} target="_blank" rel="noreferrer"
                className="font-mono text-sm text-teal-700 hover:underline">{truncate(data.aminaWallet, 18)}</a>
              <CopyButton text={data.aminaWallet} />
            </div>
            <p className="text-xs font-mono text-ink-900 mt-1">${fmt(data.bankWalletOnChainBalance)} USDC on-chain</p>
          </div>
        </Card>
        <Card title="" subtitle="">
          <div className="text-center py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Segregated Vaults</p>
            <p className="text-2xl font-bold text-ink-900">{data.totalVaults}</p>
            <p className="text-[10px] text-slate-400">Each with unique program</p>
          </div>
        </Card>
        <Card title="" subtitle="">
          <div className="text-center py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Total Deposited</p>
            <p className="text-2xl font-bold font-mono text-ink-900">${fmt(data.totalDeposited)}</p>
          </div>
        </Card>
        <Card title="" subtitle="">
          <div className="text-center py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Total NAV</p>
            <p className="text-2xl font-bold font-mono text-teal-700">${fmt(data.totalNAV)}</p>
          </div>
        </Card>
        <Card title="" subtitle="">
          <div className="text-center py-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">On-Chain Verified Events</p>
            <p className="text-2xl font-bold text-success-700">{totalOnChainEvents}<span className="text-sm text-slate-400 font-normal">/{totalEvents}</span></p>
          </div>
        </Card>
      </div>

      <div className="bg-success-100/60 border border-success-700/20 rounded-[14px] px-5 py-3.5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-success-700 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-success-700">Non-Commingling Verified On-Chain</p>
          <p className="text-xs text-success-700/80 mt-0.5">
            Each vault operates as a segregated on-chain program with a unique program ID. Funds deposited into a vault can only move within that vault's
            mandate-approved strategies. No cross-vault fund movement is permitted. All transactions are verifiable on Solana devnet.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by vault ID, client, credential, or wallet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-[10px] text-xs focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No vaults match your search.</div>
      ) : (
        <div className="space-y-6">
          {filtered.map((group) => (
            <Card key={group.ownerWallet} title="" subtitle="">
              <button
                onClick={() => toggleOwner(group.ownerWallet)}
                className="w-full flex items-center justify-between mb-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-review-100 border border-review-700/20 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-review-700" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900">Client Wallet</p>
                      <span className="font-mono text-xs text-slate-600">{truncate(group.ownerWallet, 20)}</span>
                      <CopyButton text={group.ownerWallet} />
                      <a href={addrLink(group.ownerWallet)} target="_blank" rel="noreferrer"
                        className="text-slate-400 hover:text-teal-700">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {group.vaultCount} vault{group.vaultCount !== 1 ? 's' : ''} &middot;
                      ${fmt(group.totalDeposited)} deposited &middot;
                      ${fmt(group.totalNAV)} NAV
                    </p>
                  </div>
                </div>
                {expandedOwners.has(group.ownerWallet)
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {expandedOwners.has(group.ownerWallet) && (
                <div className="space-y-3">
                  {group.vaults.map((vault) => (
                    <VaultCard key={vault.vaultId} vault={vault} aminaWallet={data?.aminaWallet || ''} />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
