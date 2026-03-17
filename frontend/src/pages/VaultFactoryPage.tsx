import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

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
}

export default function VaultFactoryPage() {
  const { notify } = useStore();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCredentialId, setSelectedCredentialId] = useState('');

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
    try {
      const vault = await api.createVault({
        credentialId: selectedCredentialId,
        baseAsset: 'USDC',
      });
      useStore.getState().setActiveVaultId(vault.vaultId);
      notify('success', `Segregated vault ${vault.vaultId} created`);
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
              {submitting ? 'Creating...' : 'Create Segregated Vault'}
            </button>
          </div>
        </form>
      </Card>

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
