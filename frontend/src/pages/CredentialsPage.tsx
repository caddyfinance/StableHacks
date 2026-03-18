import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { Shield, Globe, Link2, CheckCircle, ExternalLink } from 'lucide-react';

interface Credential {
  credentialId: string;
  clientReference: string;
  jurisdiction: string;
  riskTier: string;
  productEligibility: string;
  walletAddress: string;
  status: string;
  attestationPda?: string;
  attestationTxSig?: string;
  issuedAt: string;
}

const JURISDICTIONS = ['Switzerland', 'Singapore', 'UAE', 'UK', 'Germany'];
const RISK_TIERS = ['Conservative', 'Moderate', 'Aggressive'];

export default function CredentialsPage() {
  const { notify } = useStore();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'form' | 'entra_review' | 'issuing' | 'complete'>('form');
  const [issuingStatus, setIssuingStatus] = useState('');
  const [lastIssued, setLastIssued] = useState<Credential | null>(null);

  const [form, setForm] = useState({
    clientReference: '',
    jurisdiction: JURISDICTIONS[0],
    riskTier: RISK_TIERS[0],
    walletAddress: '',
  });

  const loadCredentials = async () => {
    try {
      const data = await api.getCredentials();
      setCredentials(data);
    } catch {
      notify('error', 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCredentials(); }, []);

  // Step 1: Fill form and proceed to Entra ID review
  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientReference || !form.walletAddress) {
      notify('error', 'Client Reference and Wallet Address are required');
      return;
    }
    setStep('entra_review');
  };

  // Step 2: Confirm via mock Entra ID and issue credential + SAS attestation
  const handleIssueWithEntra = async () => {
    setStep('issuing');
    setSubmitting(true);
    setIssuingStatus('Authenticating with Entra ID...');

    try {
      // Step 1: Mock Entra verification delay
      await new Promise(r => setTimeout(r, 800));
      setIssuingStatus('Identity verified. Creating credential in database...');

      // Step 2: Issue credential (DB + SAS attestation)
      await new Promise(r => setTimeout(r, 400));
      setIssuingStatus('Writing to database... Creating SAS attestation on Solana devnet...');

      const result = await api.issueCredential({
        clientReference: form.clientReference,
        jurisdiction: form.jurisdiction,
        riskTier: form.riskTier,
        productEligibility: 'Institutional Yield Vault',
        walletAddress: form.walletAddress,
      });

      // Step 3: If no attestation yet, poll until it appears
      if (!result.attestationPda || !result.attestationTxSig) {
        setIssuingStatus('Waiting for on-chain attestation confirmation...');
        let attempts = 0;
        while (attempts < 10) {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
          setIssuingStatus(`Waiting for on-chain confirmation... (${attempts}/10)`);
          try {
            const creds = await api.getCredentials();
            const updated = creds.find((c: Credential) => c.credentialId === result.credentialId);
            if (updated?.attestationPda && updated?.attestationTxSig) {
              result.attestationPda = updated.attestationPda;
              result.attestationTxSig = updated.attestationTxSig;
              break;
            }
          } catch { /* keep polling */ }
        }
      }

      setLastIssued(result);
      setStep('complete');
      const hasOnChain = result.attestationPda && result.attestationTxSig;
      notify('success', hasOnChain
        ? `Credential ${result.credentialId} issued with on-chain SAS attestation`
        : `Credential ${result.credentialId} issued (on-chain attestation pending)`);
      setForm({ clientReference: '', jurisdiction: JURISDICTIONS[0], riskTier: RISK_TIERS[0], walletAddress: '' });
      await loadCredentials();
    } catch {
      notify('error', 'Failed to issue credential');
      setStep('form');
    } finally {
      setSubmitting(false);
      setIssuingStatus('');
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.revokeCredential(id);
      notify('success', 'Credential revoked and on-chain attestation closed');
      await loadCredentials();
    } catch {
      notify('error', 'Failed to revoke credential');
    }
  };

  const inputClass = 'w-full bg-vault-bg border border-vault-border rounded px-3 py-2 text-sm text-vault-text placeholder-vault-muted focus:outline-none focus:border-vault-accent transition-colors';

  const truncate = (s: string, len = 16) => s.length > len ? `${s.slice(0, 6)}...${s.slice(-6)}` : s;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-vault-accent/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-vault-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SAS Credential Issuer</h2>
            <p className="text-sm text-vault-muted">
              Issue SAS-compatible credentials via Entra ID verified identity
            </p>
          </div>
        </div>
        {/* Entra ID badge */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded border border-blue-800/50 font-medium">Microsoft Entra ID</span>
          <span className="text-[10px] px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded border border-purple-800/50 font-medium">Solana Attestation Service</span>
          <span className="text-[10px] px-2 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-800/50 font-medium">Devnet</span>
        </div>
      </div>

      {/* Issuance Flow */}
      {step === 'form' && (
        <Card title="Issue New Credential" subtitle="Provide client details and Solana wallet for on-chain attestation">
          <form onSubmit={handleProceedToReview} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">Client Reference</label>
                <input type="text" value={form.clientReference} onChange={(e) => setForm({ ...form, clientReference: e.target.value })} placeholder="e.g. INST-2048" className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">Jurisdiction</label>
                <select value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} className={inputClass}>
                  {JURISDICTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">Risk Tier</label>
                <select value={form.riskTier} onChange={(e) => setForm({ ...form, riskTier: e.target.value })} className={inputClass}>
                  {RISK_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">Product Eligibility</label>
                <input type="text" value="Institutional Yield Vault" disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-vault-muted font-semibold mb-1.5">
                Client Solana Wallet Address
              </label>
              <p className="text-xs text-vault-muted mb-2">
                This is the wallet the client will use to connect to the Client Portal. Only this wallet will be able to access the vault.
              </p>
              <input type="text" value={form.walletAddress} onChange={(e) => setForm({ ...form, walletAddress: e.target.value })} placeholder="e.g. E6i78idaJR9V6mCKdGuaSxUJ7ZPfHkw42AVQzVMYisWn" className={`${inputClass} font-mono`} />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="px-5 py-2.5 bg-vault-accent text-white text-sm font-semibold rounded hover:bg-blue-600 transition-colors">
                Verify via Entra ID
              </button>
            </div>
          </form>
        </Card>
      )}

      {step === 'entra_review' && (
        <Card title="Entra ID Verification" subtitle="Review identity verification before issuing on-chain attestation">
          <div className="space-y-4">
            {/* Mock Entra ID verification panel */}
            <div className="bg-[#0a1628] border border-blue-900/40 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">Microsoft Entra ID Verification</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded ml-auto">Verified</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between"><span className="text-vault-muted">Identity Provider</span><span className="text-white">Microsoft Entra ID</span></div>
                <div className="flex justify-between"><span className="text-vault-muted">Auth Method</span><span className="text-white">SAML 2.0 Federation</span></div>
                <div className="flex justify-between"><span className="text-vault-muted">KYC Status</span><span className="text-green-400">Completed Offchain</span></div>
                <div className="flex justify-between"><span className="text-vault-muted">KYB Status</span><span className="text-green-400">Completed Offchain</span></div>
              </div>
            </div>

            {/* Client summary */}
            <div className="bg-vault-bg rounded-lg p-4 space-y-2">
              <p className="text-xs text-vault-muted uppercase tracking-wider font-semibold mb-2">Credential to be issued</p>
              {[
                ['Client Reference', form.clientReference],
                ['Jurisdiction', form.jurisdiction],
                ['Risk Tier', form.riskTier],
                ['Product Eligibility', 'Institutional Yield Vault'],
                ['Wallet Binding', form.walletAddress],
                ['PII On-Chain', 'No'],
                ['Revocable', 'Yes'],
                ['Attestation Type', 'SAS On-Chain (Solana Devnet)'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-vault-muted">{label}</span>
                  <span className="text-white font-mono text-xs">{typeof value === 'string' && value.length > 20 ? truncate(value) : value}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="bg-amber-900/10 border border-amber-800/30 rounded-lg p-3">
              <p className="text-xs text-amber-400">
                Issuing will create a SAS attestation on Solana devnet. Only the wallet address above will be authorized to access the client portal and vault operations.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setStep('form')} className="px-4 py-2 text-sm text-vault-muted hover:text-white transition-colors">
                Back
              </button>
              <button onClick={handleIssueWithEntra} disabled={submitting} className="px-5 py-2.5 bg-vault-accent text-white text-sm font-semibold rounded hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Issue Credential + Create Attestation
              </button>
            </div>
          </div>
        </Card>
      )}

      {step === 'issuing' && (
        <Card title="Issuing Credential" subtitle="Processing on-chain attestation">
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-10 h-10 border-2 border-vault-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm text-white font-medium">{issuingStatus || 'Processing...'}</p>
              <p className="text-xs text-vault-muted">This may take up to 30 seconds for Solana devnet confirmation</p>
            </div>
            <div className="w-full max-w-xs space-y-2 mt-2">
              {['Entra ID Verification', 'Database Record', 'SAS Attestation (Solana)'].map((label, i) => {
                const statusText = issuingStatus.toLowerCase();
                const done = i === 0 ? statusText.includes('verified') || statusText.includes('database') || statusText.includes('sas') || statusText.includes('waiting')
                  : i === 1 ? statusText.includes('sas') || statusText.includes('waiting')
                  : statusText.includes('waiting') || statusText.includes('confirmation');
                const active = i === 0 ? statusText.includes('authenticating') || statusText.includes('entra')
                  : i === 1 ? statusText.includes('database')
                  : statusText.includes('sas') || statusText.includes('solana') || statusText.includes('waiting');
                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                      done ? 'bg-green-500 text-white' : active ? 'bg-vault-accent text-white animate-pulse' : 'bg-vault-border text-vault-muted'
                    }`}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className={`text-xs ${done ? 'text-green-400' : active ? 'text-white' : 'text-vault-muted'}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {step === 'complete' && lastIssued && (
        <Card title="Credential Issued Successfully" subtitle="On-chain attestation created">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Credential {lastIssued.credentialId} issued</span>
            </div>
            <div className="bg-vault-bg rounded-lg p-4 space-y-2.5">
              {[
                ['Credential ID', lastIssued.credentialId],
                ['Client Reference', lastIssued.clientReference],
                ['Wallet Binding', lastIssued.walletAddress],
                ['Status', lastIssued.status],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-vault-muted">{label}</span>
                  <span className="text-white font-mono text-xs">{truncate(value as string, 20)}</span>
                </div>
              ))}

              {/* Attestation PDA — linked to explorer */}
              {lastIssued.attestationPda ? (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Attestation PDA</span>
                  <a
                    href={`https://solscan.io/account/${lastIssued.attestationPda}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-vault-accent hover:underline font-mono text-xs"
                  >
                    {truncate(lastIssued.attestationPda, 20)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-vault-muted">On-Chain</span>
                  <span className="text-yellow-400 text-xs">SAS not configured</span>
                </div>
              )}

              {/* Tx Signature — linked to explorer */}
              {lastIssued.attestationTxSig && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-vault-muted">Transaction</span>
                  <a
                    href={`https://solscan.io/tx/${lastIssued.attestationTxSig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-vault-accent hover:underline font-mono text-xs"
                  >
                    {truncate(lastIssued.attestationTxSig, 20)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Explorer quick links */}
            {(lastIssued.attestationPda || lastIssued.attestationTxSig) && (
              <div className="flex gap-3">
                {lastIssued.attestationPda && (
                  <a href={`https://solscan.io/account/${lastIssued.attestationPda}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-vault-accent hover:underline bg-vault-accent/10 px-3 py-1.5 rounded">
                    <ExternalLink className="w-3 h-3" /> View Attestation Account
                  </a>
                )}
                {lastIssued.attestationTxSig && (
                  <a href={`https://solscan.io/tx/${lastIssued.attestationTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-green-400 hover:underline bg-green-900/20 px-3 py-1.5 rounded">
                    <ExternalLink className="w-3 h-3" /> View Transaction
                  </a>
                )}
              </div>
            )}

            <button onClick={() => { setStep('form'); setLastIssued(null); }} className="px-4 py-2 bg-vault-accent text-white text-sm font-semibold rounded hover:bg-blue-600 transition-colors">
              Issue Another
            </button>
          </div>
        </Card>
      )}

      {/* Credentials Table */}
      <Card title="Issued Credentials" subtitle="All institutional credentials and their on-chain attestation status">
        {loading ? (
          <p className="text-sm text-vault-muted">Loading credentials...</p>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-vault-muted">No credentials issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-vault-muted border-b border-vault-border">
                  <th className="text-left py-2 pr-3 font-semibold">Credential</th>
                  <th className="text-left py-2 pr-3 font-semibold">Client</th>
                  <th className="text-left py-2 pr-3 font-semibold">Wallet</th>
                  <th className="text-left py-2 pr-3 font-semibold">Status</th>
                  <th className="text-left py-2 pr-3 font-semibold">Attestation</th>
                  <th className="text-left py-2 pr-3 font-semibold">Transaction</th>
                  <th className="text-left py-2 pr-3 font-semibold">Issued</th>
                  <th className="text-right py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.credentialId} className="border-b border-vault-border/50 hover:bg-vault-bg/30 transition-colors">
                    <td className="py-2.5 pr-3 font-mono text-xs text-vault-text">{c.credentialId}</td>
                    <td className="py-2.5 pr-3 text-vault-text">{c.clientReference}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-vault-muted">{truncate(c.walletAddress)}</td>
                    <td className="py-2.5 pr-3"><StatusBadge status={c.status} /></td>
                    <td className="py-2.5 pr-3">
                      {c.attestationPda ? (
                        <a href={`https://solscan.io/account/${c.attestationPda}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-vault-accent hover:underline font-mono text-xs">
                          {truncate(c.attestationPda, 12)}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-vault-muted">DB only</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.attestationTxSig ? (
                        <a href={`https://solscan.io/tx/${c.attestationTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-400 hover:underline font-mono text-xs">
                          {truncate(c.attestationTxSig, 12)}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-vault-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-vault-muted text-xs">{new Date(c.issuedAt).toLocaleDateString()}</td>
                    <td className="py-2.5 text-right">
                      {c.status !== 'revoked' && (
                        <button onClick={() => handleRevoke(c.credentialId)} className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
