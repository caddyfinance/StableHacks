import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { ExternalLink, CheckCircle } from 'lucide-react';

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
    className="flex items-center gap-1 text-vault-accent hover:underline font-mono text-xs"
  >
    {truncate(value, 18)}
    <ExternalLink className="w-3 h-3 flex-shrink-0" />
  </a>
);

export default function VaultFactoryPage() {
  const { notify } = useStore();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCredentialId, setSelectedCredentialId] = useState('');
  const [lastCreated, setLastCreated] = useState<CreatedVault | null>(null);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredentialId) {
      notify('error', 'Please select a credential');
      return;
    }
    setSubmitting(true);
    setLastCreated(null);
    try {
      const vault = await api.createVault({
        credentialId: selectedCredentialId,
        baseAsset: 'USDC',
      });
      useStore.getState().setActiveVaultId(vault.vaultId);
      setLastCreated(vault);
      notify('success', `Segregated vault ${vault.vaultId} deployed on-chain`);
      await loadData();
    } catch {
      notify('error', 'Failed to create vault');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCred = credentials.find((c) => c.credentialId === selectedCredentialId);

  const inputClass =
    'w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-vault-text focus:outline-none focus:border-vault-accent transition-colors';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Segregated Vault Factory
        </h2>
        <p className="text-sm text-vault-muted mt-1">
          Provision individually segregated, non-pooled vaults for institutional clients
        </p>
        <div className="flex gap-2 mt-3">
          <span className="text-[10px] px-2 py-0.5 bg-blue-900/40 text-blue-400 rounded font-semibold">
            Segregated
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-purple-900/40 text-purple-400 rounded font-semibold">
            Non-Pooled
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-green-900/40 text-green-400 rounded font-semibold">
            Permissioned
          </span>
        </div>
      </div>

      {/* Create Vault Form */}
      <Card title="Create Segregated Vault" subtitle="Each vault is isolated per credential holder">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">
                Credential ID
              </label>
              {credentials.length === 0 ? (
                <p className="text-sm text-vault-muted py-2">
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
              <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">
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
            <div className="bg-vault-bg/50 border border-vault-border rounded px-3 py-2.5 text-xs text-vault-muted">
              Selected credential: <span className="text-vault-text font-medium">{selectedCred.clientReference}</span>
              <span className="mx-2 text-vault-border">|</span>
              ID: <span className="font-mono text-vault-text">{selectedCred.credentialId}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || credentials.length === 0}
              className="px-5 py-2 bg-vault-accent text-white text-sm font-semibold rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Deploying on-chain...' : 'Create Segregated Vault'}
            </button>
          </div>
        </form>
      </Card>

      {/* Deployment Confirmation */}
      {lastCreated && (
        <Card title="Vault Deployed Successfully" subtitle="On-chain contract created and attested">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Vault {lastCreated.vaultId} deployed</span>
            </div>

            {/* Deployment Steps */}
            {lastCreated.deploymentSteps && lastCreated.deploymentSteps.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Deployment Steps</p>
                {lastCreated.deploymentSteps.map((s, i) => (
                  <div key={i} className={`flex items-start gap-3 bg-vault-bg rounded-lg px-4 py-3 border-l-2 ${
                    s.status === 'success' ? 'border-l-green-500' : s.status === 'failed' ? 'border-l-red-500' : 'border-l-yellow-500'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 flex-shrink-0 ${
                      s.status === 'success' ? 'bg-green-500 text-white' : s.status === 'failed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-black'
                    }`}>
                      {s.status === 'success' ? '\u2713' : s.status === 'failed' ? '\u2717' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-medium">{s.step}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          s.status === 'success' ? 'bg-green-900/30 text-green-400' :
                          s.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                          'bg-yellow-900/30 text-yellow-400'
                        }`}>{s.status}</span>
                      </div>
                      {s.detail && (
                        <p className="text-[10px] text-vault-muted mt-1 truncate" title={s.detail}>{s.detail}</p>
                      )}
                      <div className="flex gap-3 mt-1.5">
                        {s.txSignature && (
                          <a href={`https://solscan.io/tx/${s.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-[10px] text-vault-accent hover:underline">
                            View Tx <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {s.address && (
                          <a href={`https://solscan.io/account/${s.address}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-[10px] text-purple-400 hover:underline">
                            View Account <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Vault Details */}
            <div className="bg-vault-bg rounded-lg p-4 space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold mb-1">Vault Details</p>
              {[
                ['Vault ID', lastCreated.vaultId],
                ['Credential ID', lastCreated.credentialId],
                ['Owner Wallet', lastCreated.ownerWallet],
                ['Base Asset', lastCreated.baseAsset],
                ['Status', lastCreated.status],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-vault-muted">{label}</span>
                  <span className="text-white font-mono text-xs">
                    {typeof value === 'string' && value.length > 20 ? truncate(value, 20) : value}
                  </span>
                </div>
              ))}

              {lastCreated.programId && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Contract Address</span>
                  <ExplorerLink type="address" value={lastCreated.programId} />
                </div>
              )}

              {lastCreated.aminaBankWallet && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Deployed by (Amina Bank)</span>
                  <ExplorerLink type="address" value={lastCreated.aminaBankWallet} />
                </div>
              )}

              {lastCreated.onChainAddress && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Vault PDA (On-Chain)</span>
                  <ExplorerLink type="address" value={lastCreated.onChainAddress} />
                </div>
              )}

              {lastCreated.credentialPda && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Credential PDA</span>
                  <ExplorerLink type="address" value={lastCreated.credentialPda} />
                </div>
              )}

              {lastCreated.vaultAttestationPda && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">SAS Attestation PDA</span>
                  <ExplorerLink type="address" value={lastCreated.vaultAttestationPda} />
                </div>
              )}
            </div>

            {/* Explorer quick links */}
            <div className="flex flex-wrap gap-2">
              {lastCreated.programId && (
                <a href={`https://solscan.io/account/${lastCreated.programId}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-white hover:underline bg-vault-border/50 px-3 py-1.5 rounded">
                  <ExternalLink className="w-3 h-3" /> View Contract
                </a>
              )}
              {lastCreated.onChainAddress && (
                <a href={`https://solscan.io/account/${lastCreated.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-vault-accent hover:underline bg-vault-accent/10 px-3 py-1.5 rounded">
                  <ExternalLink className="w-3 h-3" /> View Vault Account
                </a>
              )}
              {lastCreated.vaultProgramTxSig && (
                <a href={`https://solscan.io/tx/${lastCreated.vaultProgramTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:underline bg-green-900/20 px-3 py-1.5 rounded">
                  <ExternalLink className="w-3 h-3" /> View Deploy Tx
                </a>
              )}
            </div>

            <button onClick={() => setLastCreated(null)} className="text-xs text-vault-muted hover:text-white transition-colors">
              Dismiss
            </button>
          </div>
        </Card>
      )}

      {/* Vault Summary Cards */}
      <Card title="Provisioned Vaults" subtitle="Individually segregated vault instances">
        {loading ? (
          <p className="text-sm text-vault-muted">Loading vaults...</p>
        ) : vaults.length === 0 ? (
          <p className="text-sm text-vault-muted">No vaults created yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {vaults.map((v) => (
              <div
                key={v.vaultId}
                className="bg-vault-bg border border-vault-border rounded-lg p-4 hover:border-vault-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <StatusBadge status={v.status} size="md" />
                  <span className="text-[10px] font-semibold text-vault-muted uppercase tracking-wider">
                    {v.baseAsset}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Vault ID</p>
                    <p className="text-xs font-mono text-vault-text mt-0.5">
                      {v.vaultId.length > 20
                        ? `${v.vaultId.slice(0, 8)}...${v.vaultId.slice(-6)}`
                        : v.vaultId}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Credential ID</p>
                    <p className="text-xs font-mono text-vault-text mt-0.5">
                      {v.credentialId.length > 20
                        ? `${v.credentialId.slice(0, 8)}...${v.credentialId.slice(-6)}`
                        : v.credentialId}
                    </p>
                  </div>

                  {v.clientReference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Client</p>
                      <p className="text-xs text-vault-text mt-0.5">{v.clientReference}</p>
                    </div>
                  )}

                  {v.ownerWallet && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Owner Wallet</p>
                      <p className="text-xs font-mono text-vault-muted mt-0.5">{truncate(v.ownerWallet)}</p>
                    </div>
                  )}

                  {v.programId && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">Unique Program ID</p>
                      <div className="mt-0.5">
                        <ExplorerLink type="address" value={v.programId} />
                      </div>
                    </div>
                  )}

                  {v.onChainAddress && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-vault-muted font-semibold">On-Chain</p>
                      <div className="mt-0.5">
                        <ExplorerLink type="address" value={v.onChainAddress} />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    useStore.getState().setActiveVaultId(v.vaultId);
                    notify('info', `Active vault set to ${v.vaultId.slice(0, 8)}...`);
                  }}
                  className="mt-3 w-full text-xs text-vault-accent hover:text-white border border-vault-accent/30 hover:bg-vault-accent/10 rounded py-1.5 font-medium transition-colors"
                >
                  Set as Active Vault
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
