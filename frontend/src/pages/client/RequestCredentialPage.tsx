import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { Search, Link2, CheckCircle, Loader2, Shield, AlertCircle, ExternalLink } from 'lucide-react';

export default function RequestCredentialPage() {
  const { clientInfo, setClientInfo, setActiveVaultId, notify } = useStore();
  const walletAddress = clientInfo?.walletAddress || '';
  const [credentialDetail, setCredentialDetail] = useState<any>(null);

  const [clientRef, setClientRef] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState('');
  const [binding, setBinding] = useState(false);
  const [bound, setBound] = useState(false);
  const [boundResult, setBoundResult] = useState<any>(null);

  const hasCredential = !!clientInfo?.credentialId;

  // Load full credential detail (with attestation data) from API
  useEffect(() => {
    if (hasCredential && walletAddress) {
      api.lookupWallet(walletAddress)
        .then((result: any) => {
          if (result.authenticated && result.credential) {
            setCredentialDetail(result.credential);
          }
        })
        .catch(() => {});
    }
  }, [hasCredential, walletAddress]);

  const handleLookup = async () => {
    if (!clientRef.trim()) return;
    setLookupError('');
    setLookupResult(null);
    try {
      const result = await api.lookupByReference(clientRef.trim());
      if (result.found) {
        setLookupResult(result);
      } else {
        setLookupError(result.reason || 'No credential found for this client reference');
      }
    } catch {
      setLookupError('Failed to look up credential. Check your client reference and try again.');
    }
  };

  const handleBind = async () => {
    if (!lookupResult || !walletAddress) return;
    setBinding(true);
    try {
      const result = await api.bindWallet(lookupResult.credentialId, walletAddress);
      if (result.success && result.credential) {
        setBound(true);
        setBoundResult(result);
        setClientInfo({
          walletAddress,
          credentialId: result.credential.credentialId,
          clientReference: result.credential.clientReference,
          jurisdiction: result.credential.jurisdiction,
          riskTier: result.credential.riskTier,
        });
        if (result.vault) {
          setActiveVaultId(result.vault.vaultId);
        }
        notify('success', 'Wallet bound to credential successfully');
      } else {
        setLookupError(result.reason || 'Failed to bind wallet');
      }
    } catch {
      setLookupError('Failed to bind wallet to credential');
    } finally {
      setBinding(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Request Credential Access</h1>
        <p className="text-sm text-vault-muted mt-1">
          Link your wallet to an institutional credential issued by AMINA
        </p>
      </div>

      {/* Already has credential */}
      {hasCredential && (
        <Card title="Credential Status" subtitle="Your wallet is linked to an active credential">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Credential Active</p>
              <p className="text-xs text-vault-muted">Your wallet is verified and linked</p>
            </div>
            <StatusBadge status="active" size="md" />
          </div>
          <div className="bg-vault-bg rounded-lg p-4 space-y-2.5">
            {[
              ['Wallet', walletAddress.length > 20 ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}` : walletAddress],
              ['Credential ID', clientInfo?.credentialId || '—'],
              ['Client Reference', clientInfo?.clientReference || '—'],
              ['Jurisdiction', clientInfo?.jurisdiction || '—'],
              ['Risk Tier', clientInfo?.riskTier || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-vault-muted">{label}</span>
                <span className="text-white font-mono text-xs">{value}</span>
              </div>
            ))}

            {/* On-chain attestation links */}
            {credentialDetail?.attestationPda && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-vault-muted">SAS Attestation</span>
                <a
                  href={`https://solscan.io/account/${credentialDetail.attestationPda}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-vault-accent hover:underline font-mono text-xs"
                >
                  {credentialDetail.attestationPda.slice(0, 6)}...{credentialDetail.attestationPda.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {credentialDetail?.attestationTxSig && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-vault-muted">Attestation Tx</span>
                <a
                  href={`https://solscan.io/tx/${credentialDetail.attestationTxSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-400 hover:underline font-mono text-xs"
                >
                  {credentialDetail.attestationTxSig.slice(0, 6)}...{credentialDetail.attestationTxSig.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Wallet explorer link */}
            <div className="flex justify-between text-sm items-center">
              <span className="text-vault-muted">Wallet on Explorer</span>
              <a
                href={`https://solscan.io/account/${walletAddress}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-vault-muted hover:text-vault-accent font-mono text-xs"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Quick explorer links */}
          {(credentialDetail?.attestationPda || credentialDetail?.attestationTxSig) && (
            <div className="flex gap-3 mt-3">
              {credentialDetail.attestationPda && (
                <a href={`https://solscan.io/account/${credentialDetail.attestationPda}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-vault-accent hover:underline bg-vault-accent/10 px-3 py-1.5 rounded">
                  <ExternalLink className="w-3 h-3" /> View Attestation on Solana
                </a>
              )}
              {credentialDetail.attestationTxSig && (
                <a href={`https://solscan.io/tx/${credentialDetail.attestationTxSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:underline bg-green-900/20 px-3 py-1.5 rounded">
                  <ExternalLink className="w-3 h-3" /> View Transaction
                </a>
              )}
            </div>
          )}

          {!credentialDetail?.attestationPda && (
            <div className="mt-3 px-3 py-2 rounded bg-yellow-900/15 border border-yellow-800/40">
              <p className="text-xs text-yellow-400">On-chain SAS attestation not yet created for this credential. Contact AMINA admin to issue an on-chain attestation.</p>
            </div>
          )}
        </Card>
      )}

      {/* No credential — request flow */}
      {!hasCredential && !bound && (
        <>
          {/* Current Wallet */}
          <Card title="Connected Wallet" subtitle="This wallet will be bound to your credential">
            <div className="bg-vault-bg rounded-lg p-3 flex items-center gap-3">
              <Shield className="w-5 h-5 text-vault-accent flex-shrink-0" />
              <div>
                <p className="text-xs text-vault-muted">Wallet Address</p>
                <p className="text-sm font-mono text-white">{walletAddress}</p>
              </div>
            </div>
          </Card>

          {/* How it works */}
          <Card title="How Credential Binding Works" subtitle="3-step verification process">
            <div className="space-y-3">
              {[
                { step: 1, title: 'Enter Client Reference', desc: 'Provide the institutional client reference given to you by AMINA during onboarding' },
                { step: 2, title: 'Verify Credential', desc: 'The system looks up your SAS-compatible credential and confirms your institutional status' },
                { step: 3, title: 'Bind Wallet', desc: 'Your Solana wallet is bound to the credential, giving you access to your segregated vault' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-vault-accent/20 text-vault-accent flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-xs text-vault-muted">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Lookup Form */}
          <Card title="Step 1: Look Up Your Credential" subtitle="Enter the client reference provided during institutional onboarding">
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientRef}
                  onChange={(e) => setClientRef(e.target.value)}
                  placeholder="e.g. INST-2048"
                  className="flex-1 bg-vault-bg border border-vault-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-vault-accent"
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
                <button
                  onClick={handleLookup}
                  className="bg-vault-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Look Up
                </button>
              </div>

              {lookupError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {lookupError}
                </div>
              )}

              {/* Lookup Result */}
              {lookupResult && (
                <div className="border border-vault-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-400 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Credential Found</span>
                  </div>
                  <div className="bg-vault-bg rounded-lg p-3 space-y-2">
                    {[
                      ['Credential ID', lookupResult.credentialId],
                      ['Client Reference', lookupResult.clientReference],
                      ['Jurisdiction', lookupResult.jurisdiction],
                      ['Risk Tier', lookupResult.riskTier],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-vault-muted">{label}</span>
                        <span className="text-white font-mono text-xs">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-vault-muted mb-3">
                      Confirm this is your credential. Clicking below will bind your connected wallet to this credential permanently.
                    </p>
                    <button
                      onClick={handleBind}
                      disabled={binding}
                      className="w-full bg-vault-accent hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {binding ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Binding Wallet...</>
                      ) : (
                        <><Link2 className="w-4 h-4" /> Bind Wallet to Credential</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Success state */}
      {bound && boundResult && (
        <Card title="Credential Bound Successfully" subtitle="Your wallet is now linked to your institutional credential">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Wallet Bound</p>
              <p className="text-xs text-vault-muted">You now have full access to your vault</p>
            </div>
          </div>
          <div className="bg-vault-bg rounded-lg p-4 space-y-2">
            {[
              ['Credential ID', boundResult.credential?.credentialId],
              ['Client Reference', boundResult.credential?.clientReference],
              ['Jurisdiction', boundResult.credential?.jurisdiction],
              ...(boundResult.vault ? [['Vault', boundResult.vault.vaultId]] : []),
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-sm">
                <span className="text-vault-muted">{label}</span>
                <span className="text-white font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-vault-muted mt-3">
            Navigate to Overview to see your vault status and balances.
          </p>
        </Card>
      )}
    </div>
  );
}
