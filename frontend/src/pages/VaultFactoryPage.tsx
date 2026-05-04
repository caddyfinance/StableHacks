import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { ExternalLink, CheckCircle, Loader2, Clock, XCircle, Shield, Key, FileCheck, Vault, Award, Zap } from 'lucide-react';

interface Credential {
  credentialId: string;
  clientReference: string;
  status: string;
}

interface Vault {
  vaultId: string;
  credentialId: string;
  status: string;
  baseAsset: string;
  clientReference?: string;
  ownerWallet?: string;
  onChainAddress?: string;
  programId?: string;
  vaultAttestationPda?: string;
  vaultAttestationTxSig?: string;
}

interface DeploymentStep {
  step: string;
  status: string;
  detail?: string;
  txSignature?: string;
  address?: string;
}

interface CreatedVault extends Vault {
  programId?: string;
  credentialPda?: string;
  credentialTxSig?: string;
  vaultProgramTxSig?: string;
  aminaBankWallet?: string;
  deploymentSteps?: DeploymentStep[];
}

const truncate = (s: string, len = 16) =>
  s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-6)}` : s;

const ExplorerLink = ({ type, value }: { type: 'address' | 'tx'; value: string }) => (
  <a
    href={`https://solscan.io/${type === 'tx' ? 'tx' : 'account'}/${value}?cluster=devnet`}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 text-teal-700 hover:underline font-mono text-xs"
  >
    {truncate(value, 18)}
    <ExternalLink className="w-3 h-3 flex-shrink-0" />
  </a>
);

const DEPLOY_STEPS = [
  { key: 'Deploy Segregated Program', label: 'Deploy Segregated Program', description: 'Deploying unique on-chain program instance via BPF loader', icon: Shield, duration: 18000 },
  { key: 'Initialize Program', label: 'Initialize Program', description: 'Setting admin authority and binding vault owner wallet', icon: Key, duration: 8000 },
  { key: 'Register Credential On-Chain', label: 'Register Credential', description: 'Creating credential PDA on the new program', icon: FileCheck, duration: 6000 },
  { key: 'Create Vault On-Chain', label: 'Create Vault On-Chain', description: 'Deploying vault PDA bound to credential holder', icon: Vault, duration: 6000 },
  { key: 'Create SAS Attestation', label: 'SAS Attestation', description: 'Creating Solana Attestation Service proof', icon: Award, duration: 6000 },
];

type LiveStepStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

interface LiveStep {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: LiveStepStatus;
  detail?: string;
  txSignature?: string;
  address?: string;
  elapsed?: number;
}

export default function VaultFactoryPage() {
  const { notify } = useStore();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [lastCreated, setLastCreated] = useState<CreatedVault | null>(null);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [deployStartTime, setDeployStartTime] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = async () => {
    try {
      const [creds, vaultData] = await Promise.all([
        api.getCredentials(),
        api.getVaults(),
      ]);
      setCredentials(creds.filter((c: Credential) => c.status === 'active'));
      setVaults(vaultData);
      if (creds.length > 0 && !selectedCredentialId) {
        const activeCreds = creds.filter((c: Credential) => c.status === 'active');
        if (activeCreds.length > 0) {
          setSelectedCredentialId(activeCreds[0].credentialId);
        }
      }
    } catch {
      notify('error', 'Failed to load vault factory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Animate steps based on estimated durations while API is in-flight
  const startLiveProgress = () => {
    const initial: LiveStep[] = DEPLOY_STEPS.map((s) => ({
      ...s,
      status: 'pending' as LiveStepStatus,
    }));
    initial[0].status = 'in_progress';
    setLiveSteps(initial);

    const startTime = Date.now();
    setDeployStartTime(startTime);

    // Calculate cumulative start times for each step
    const cumulativeMs = DEPLOY_STEPS.reduce<number[]>((acc, _s, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + DEPLOY_STEPS[i - 1].duration);
      return acc;
    }, []);

    timerRef.current = setInterval(() => {
      const totalElapsed = Date.now() - startTime;
      setLiveSteps((prev) =>
        prev.map((step, i) => {
          // Don't overwrite finalized steps (from API response)
          if (step.detail && step.status !== 'in_progress') return step;
          const stepStart = cumulativeMs[i];
          if (totalElapsed >= stepStart + DEPLOY_STEPS[i].duration) {
            return { ...step, status: 'success' as LiveStepStatus, elapsed: DEPLOY_STEPS[i].duration };
          }
          if (totalElapsed >= stepStart) {
            return { ...step, status: 'in_progress' as LiveStepStatus, elapsed: totalElapsed - stepStart };
          }
          return { ...step, status: 'pending' as LiveStepStatus };
        }),
      );
    }, 500);
  };

  // Replace simulated statuses with actual results from API
  const finalizeLiveSteps = (deploymentSteps: DeploymentStep[]) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setLiveSteps((prev) =>
      prev.map((step) => {
        const match = deploymentSteps.find((d) => d.step === step.key);
        if (match) {
          return {
            ...step,
            status: match.status as LiveStepStatus,
            detail: match.detail,
            txSignature: match.txSignature,
            address: match.address,
          };
        }
        return { ...step, status: 'skipped' as LiveStepStatus };
      }),
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredentialId) {
      notify('error', 'Please select a credential');
      return;
    }
    setSubmitting(true);
    setLastCreated(null);
    startLiveProgress();
    try {
      const vault = await api.createVault({
        credentialId: selectedCredentialId,
        baseAsset: 'USDC',
      });
      finalizeLiveSteps(vault.deploymentSteps || []);
      useStore.getState().setActiveVaultId(vault.vaultId);
      setLastCreated(vault);
      notify('success', `Segregated vault ${vault.vaultId} deployed on-chain`);
      await loadData();
    } catch {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLiveSteps((prev) =>
        prev.map((s) =>
          s.status === 'in_progress' || s.status === 'pending'
            ? { ...s, status: 'failed' as LiveStepStatus, detail: 'Deployment failed' }
            : s,
        ),
      );
      notify('error', 'Failed to create vault');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (vaultId: string) => {
    setActivating(vaultId);
    try {
      await api.activateVault(vaultId);
      notify('success', `Vault ${vaultId} activated — mandate anchored on-chain`);
      await loadData();
      if (lastCreated?.vaultId === vaultId) {
        setLastCreated((prev) => prev ? { ...prev, status: 'active' } : prev);
      }
      useStore.getState().setActiveVaultId(vaultId);
    } catch (e: any) {
      notify('error', e?.message || e?.reason || 'Failed to activate vault');
    } finally {
      setActivating(null);
    }
  };

  const selectedCred = credentials.find((c) => c.credentialId === selectedCredentialId);

  const inputClass =
    'w-full bg-white border border-slate-200 rounded-[12px] px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-ink-900 tracking-tight">
          Segregated Vault Factory
        </h2>
        <p className="text-sm text-slate-700 mt-1">
          Provision individually segregated, non-pooled vaults for institutional clients
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[10px] px-2 py-0.5 bg-teal-100 text-teal-700 rounded font-semibold">
            Segregated
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold">
            Non-Pooled
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-success-100 text-success-700 rounded font-semibold">
            Permissioned
          </span>
        </div>
      </div>

      {/* Create Vault Form */}
      <Card title="Create Segregated Vault" subtitle="Each vault is isolated per credential holder">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                Credential ID
              </label>
              {credentials.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  No active credentials available. Issue a credential first.
                </p>
              ) : (
                <select
                  value={selectedCredentialId}
                  onChange={(e) => setSelectedCredentialId(e.target.value)}
                  className={inputClass}
                >
                  {credentials.map((c) => (
                    <option key={c.credentialId} value={c.credentialId}>
                      {c.credentialId.length > 16
                        ? `${c.credentialId.slice(0, 8)}...${c.credentialId.slice(-6)}`
                        : c.credentialId}{' '}
                      ({c.clientReference})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                Base Asset
              </label>
              <input
                type="text"
                value="USDC"
                disabled
                className={`${inputClass} opacity-60 cursor-not-allowed`}
              />
            </div>
          </div>

          {selectedCred && (
            <div className="bg-teal-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-500">
              Selected credential: <span className="text-ink-900 font-medium">{selectedCred.clientReference}</span>
              <span className="mx-2 text-slate-200">|</span>
              ID: <span className="font-mono text-ink-900">{selectedCred.credentialId}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || credentials.length === 0}
              className="px-5 py-2 bg-teal-700 text-white text-sm font-semibold rounded-[12px] hover:bg-teal-800 transition-all ease-amina duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Deploying Segregated Program...' : 'Create Segregated Vault'}
            </button>
          </div>
        </form>
      </Card>

      {/* Live Deployment Progress */}
      {liveSteps.length > 0 && (
        <Card
          title={
            submitting
              ? 'Deploying Segregated Vault...'
              : lastCreated
                ? `Vault ${lastCreated.vaultId} Deployed`
                : 'Deployment Complete'
          }
          subtitle={
            submitting
              ? 'Each vault gets its own on-chain program — true non-commingling'
              : 'All deployment steps completed'
          }
        >
          <div className="space-y-1">
            {liveSteps.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = step.status === 'in_progress';
              const isDone = step.status === 'success';
              const isFailed = step.status === 'failed';
              const isSkipped = step.status === 'skipped';
              const isPending = step.status === 'pending';

              return (
                <div key={step.key} className="relative">
                  {/* Connector line */}
                  {i < liveSteps.length - 1 && (
                    <div className={`absolute left-[19px] top-[40px] w-0.5 h-[calc(100%-24px)] transition-colors duration-500 ${
                      isDone ? 'bg-success-700/50' : isFailed ? 'bg-error-700/50' : 'bg-slate-200/30'
                    }`} />
                  )}

                  <div className={`flex items-start gap-3 rounded-[12px] px-3 py-3 transition-all duration-500 ${
                    isActive ? 'bg-teal-50 ring-2 ring-teal-600/20' :
                    isDone ? 'bg-success-100/30' :
                    isFailed ? 'bg-error-100/30' :
                    ''
                  }`}>
                    {/* Step icon */}
                    <div className={`w-[38px] h-[38px] rounded-[12px] flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      isActive ? 'bg-teal-100 ring-2 ring-teal-600/40' :
                      isDone ? 'bg-success-100' :
                      isFailed ? 'bg-error-100' :
                      isSkipped ? 'bg-warning-100' :
                      'bg-slate-200/20'
                    }`}>
                      {isActive ? (
                        <Loader2 className="w-4.5 h-4.5 text-teal-700 animate-spin" />
                      ) : isDone ? (
                        <CheckCircle className="w-4.5 h-4.5 text-success-700" />
                      ) : isFailed ? (
                        <XCircle className="w-4.5 h-4.5 text-error-700" />
                      ) : isSkipped ? (
                        <Clock className="w-4.5 h-4.5 text-warning-700" />
                      ) : (
                        <StepIcon className="w-4.5 h-4.5 text-slate-700/50" />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium transition-colors duration-300 ${
                            isActive ? 'text-teal-700' :
                            isDone ? 'text-success-700' :
                            isFailed ? 'text-error-700' :
                            isPending ? 'text-slate-700/50' :
                            'text-warning-700'
                          }`}>
                            {step.label}
                          </span>
                          <span className="text-[10px] text-slate-700/40 font-mono">{i + 1}/5</span>
                        </div>

                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all duration-300 ${
                          isActive ? 'bg-teal-100 text-teal-700 animate-pulse' :
                          isDone ? 'bg-success-100 text-success-700' :
                          isFailed ? 'bg-error-100 text-error-700' :
                          isSkipped ? 'bg-warning-100 text-warning-700' :
                          'bg-slate-200/20 text-slate-700/40'
                        }`}>
                          {isActive ? 'in progress' : step.status}
                        </span>
                      </div>

                      <p className={`text-[11px] mt-0.5 transition-colors duration-300 ${
                        isActive ? 'text-slate-700' :
                        isPending ? 'text-slate-700/30' :
                        'text-slate-700/60'
                      }`}>
                        {step.detail || step.description}
                      </p>

                      {/* Explorer links once finalized */}
                      {(step.txSignature || step.address) && (
                        <div className="flex gap-3 mt-1.5">
                          {step.txSignature && (
                            <a href={`https://solscan.io/tx/${step.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-[10px] text-teal-700 hover:underline">
                              View Tx <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {step.address && (
                            <a href={`https://solscan.io/account/${step.address}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-[10px] text-purple-400 hover:underline">
                              View Account <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Progress bar for active step */}
                      {isActive && (
                        <div className="mt-2 h-1 bg-slate-200/20 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-700/60 rounded-full animate-pulse" style={{ width: '60%' }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success summary after completion */}
          {!submitting && lastCreated && (
            <>
            <div className="mt-4 pt-4 border-t border-slate-200/30">
              <div className="flex items-center gap-2 text-success-700 mb-3">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Segregated vault {lastCreated.vaultId} deployed with unique program
                </span>
              </div>

            {/* Vault Details */}
            <div className="bg-slate-100 rounded-[18px] p-4 space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Vault Details</p>
              {[
                ['Vault ID', lastCreated.vaultId],
                ['Credential ID', lastCreated.credentialId],
                ['Owner Wallet', lastCreated.ownerWallet],
                ['Base Asset', lastCreated.baseAsset],
                ['Status', lastCreated.status],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-ink-900 font-mono text-xs">
                    {typeof value === 'string' && value.length > 20 ? truncate(value, 20) : value}
                  </span>
                </div>
              ))}

              {lastCreated.programId && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Contract Address</span>
                  <ExplorerLink type="address" value={lastCreated.programId} />
                </div>
              )}

              {lastCreated.aminaBankWallet && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Deployed by (Amina Bank)</span>
                  <ExplorerLink type="address" value={lastCreated.aminaBankWallet} />
                </div>
              )}

              {lastCreated.onChainAddress && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Vault PDA (On-Chain)</span>
                  <ExplorerLink type="address" value={lastCreated.onChainAddress} />
                </div>
              )}

              {lastCreated.credentialPda && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Credential PDA</span>
                  <ExplorerLink type="address" value={lastCreated.credentialPda} />
                </div>
              )}

              {lastCreated.vaultAttestationPda && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">SAS Attestation PDA</span>
                  <ExplorerLink type="address" value={lastCreated.vaultAttestationPda} />
                </div>
              )}
            </div>

            {/* Explorer quick links */}
            <div className="flex flex-wrap gap-2 mt-3">
              {lastCreated.programId && (
                <a href={`https://solscan.io/account/${lastCreated.programId}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-ink-900 hover:underline bg-slate-100 px-3 py-1.5 rounded-[12px]">
                  <ExternalLink className="w-3 h-3" /> View Contract
                </a>
              )}
              {lastCreated.onChainAddress && (
                <a href={`https://solscan.io/account/${lastCreated.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-teal-700 hover:underline bg-teal-700/10 px-3 py-1.5 rounded-[12px]">
                  <ExternalLink className="w-3 h-3" /> View Vault Account
                </a>
              )}
              {lastCreated.vaultProgramTxSig && (
                <a href={`https://solscan.io/tx/${lastCreated.vaultProgramTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-success-700 hover:underline bg-success-100 px-3 py-1.5 rounded-[12px]">
                  <ExternalLink className="w-3 h-3" /> View Deploy Tx
                </a>
              )}
            </div>

            <button
              onClick={() => { setLastCreated(null); setLiveSteps([]); }}
              className="text-xs text-slate-500 hover:text-ink-900 transition-colors mt-2"
            >
              Dismiss
            </button>
            </div>

            {/* Mandate acceptance step — shown when vault is still in 'initiated' state */}
            {lastCreated.status !== 'active' && (
              <div className="mt-4 pt-4 border-t border-slate-200/30">
                <div className="flex items-start gap-3 bg-teal-50 border border-teal-200/60 rounded-[14px] p-4">
                  <div className="w-9 h-9 rounded-[10px] bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <FileCheck className="w-4.5 h-4.5 text-teal-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-900">Review & Activate Mandate</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      The vault is deployed but not yet active. Activating commits the default investment mandate on-chain — the client accepts a 10% liquidity buffer, 250,000 USDC consent threshold, no leverage, and low-risk strategy allocations at 40% cap.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                      {[
                        ['Liquidity Buffer', '10% (protocol minimum)'],
                        ['Consent Threshold', '250,000 USDC'],
                        ['Leverage', 'Not Permitted'],
                        ['Strategy Cap', '40% per strategy'],
                      ].map(([label, val]) => (
                        <div key={label} className="bg-white/70 rounded-[8px] px-2.5 py-1.5">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
                          <p className="text-ink-900 font-medium mt-0.5">{val}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleActivate(lastCreated.vaultId)}
                      disabled={activating === lastCreated.vaultId}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-[10px] transition-colors disabled:opacity-50"
                    >
                      {activating === lastCreated.vaultId ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Activating & Anchoring Mandate...</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5" /> Activate Vault & Accept Mandate</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {lastCreated.status === 'active' && (
              <div className="mt-4 pt-4 border-t border-slate-200/30">
                <div className="flex items-center gap-2 bg-success-100 border border-success-700/20 rounded-[12px] px-4 py-3">
                  <CheckCircle className="w-4 h-4 text-success-700 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-success-700">Vault Active — Mandate Anchored On-Chain</p>
                    <p className="text-[10px] text-success-700/80 mt-0.5">Investment mandate committed to Solana at activation. Sync badge will show on Mandate Details page.</p>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </Card>
      )}

      {/* Vault Summary Cards */}
      <Card title="Provisioned Vaults" subtitle="Individually segregated vault instances">
        {loading ? (
          <p className="text-sm text-slate-500">Loading vaults...</p>
        ) : vaults.length === 0 ? (
          <p className="text-sm text-slate-500">No vaults created yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {vaults.map((v) => (
              <div
                key={v.vaultId}
                className="bg-white border border-slate-200 rounded-[18px] p-4 hover:border-teal-700/40 transition-colors shadow-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <StatusBadge status={v.status} size="md" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {v.baseAsset}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Vault ID</p>
                    <p className="text-xs font-mono text-ink-900 mt-0.5">
                      {v.vaultId.length > 20
                        ? `${v.vaultId.slice(0, 8)}...${v.vaultId.slice(-6)}`
                        : v.vaultId}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Credential ID</p>
                    <p className="text-xs font-mono text-ink-900 mt-0.5">
                      {v.credentialId.length > 20
                        ? `${v.credentialId.slice(0, 8)}...${v.credentialId.slice(-6)}`
                        : v.credentialId}
                    </p>
                  </div>

                  {v.clientReference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Client</p>
                      <p className="text-xs text-ink-900 mt-0.5">{v.clientReference}</p>
                    </div>
                  )}

                  {v.ownerWallet && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Owner Wallet</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{truncate(v.ownerWallet)}</p>
                    </div>
                  )}

                  {v.programId && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Unique Program ID</p>
                      <div className="mt-0.5">
                        <ExplorerLink type="address" value={v.programId} />
                      </div>
                    </div>
                  )}

                  {v.onChainAddress && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">On-Chain</p>
                      <div className="mt-0.5">
                        <ExplorerLink type="address" value={v.onChainAddress} />
                      </div>
                    </div>
                  )}
                </div>

                {v.status === 'initiated' ? (
                  <button
                    onClick={() => handleActivate(v.vaultId)}
                    disabled={activating === v.vaultId}
                    className="mt-3 w-full text-xs text-white bg-teal-700 hover:bg-teal-800 rounded-[12px] py-1.5 font-semibold transition-all ease-amina duration-150 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {activating === v.vaultId ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Activating...</>
                    ) : (
                      <><Zap className="w-3.5 h-3.5" /> Activate & Anchor Mandate</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      useStore.getState().setActiveVaultId(v.vaultId);
                      notify('info', `Active vault set to ${v.vaultId.slice(0, 8)}...`);
                    }}
                    className="mt-3 w-full text-xs text-teal-700 hover:text-ink-900 border border-teal-700/30 hover:bg-teal-50 rounded-[12px] py-1.5 font-medium transition-all ease-amina duration-150"
                  >
                    Set as Active Vault
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
