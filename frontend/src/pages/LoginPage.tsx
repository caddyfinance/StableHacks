import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useStore, ROLE_LABELS, Role } from '../store/useStore';
import { api } from '../lib/api';
import {
  Shield, ArrowLeft, TrendingUp, ClipboardCheck, AlertTriangle,
  Wallet, CheckCircle, Loader2, Lock, Mail,
} from 'lucide-react';

const AMINA_ROLE_CONFIG: { role: Role; icon: typeof Shield; description: string; email: string; password: string }[] = [
  { role: 'admin', icon: Shield, description: 'Issue credentials, create vaults, configure mandates', email: 'admin@amina.bank', password: 'admin123' },
  { role: 'portfolio_manager', icon: TrendingUp, description: 'Execute allocations, manage strategy positions', email: 'pm@amina.bank', password: 'pm123' },
  { role: 'compliance_officer', icon: ClipboardCheck, description: 'Monitor audit trails, review events, vault snapshots', email: 'compliance@amina.bank', password: 'compliance123' },
  { role: 'emergency_admin', icon: AlertTriangle, description: 'Pause vaults, disable adapters, trigger unwind', email: 'emergency@amina.bank', password: 'emergency123' },
];

export default function LoginPage() {
  const { portal } = useParams<{ portal: string }>();
  const navigate = useNavigate();
  const { loginAdmin, loginClient } = useStore();
  const { publicKey, connected } = useWallet();

  // Admin login state
  const [selectedRole, setSelectedRole] = useState<(typeof AMINA_ROLE_CONFIG)[number] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminLogging, setAdminLogging] = useState(false);
  const [adminError, setAdminError] = useState('');

  // Client wallet state
  const [checking, setChecking] = useState(false);
  const [credentialFound, setCredentialFound] = useState(false);
  const [credentialInfo, setCredentialInfo] = useState<any>(null);

  const isAmina = portal === 'amina';

  // Pre-fill email/password when role card is selected
  const handleSelectRole = (config: (typeof AMINA_ROLE_CONFIG)[number]) => {
    setSelectedRole(config);
    setEmail(config.email);
    setPassword(config.password);
    setAdminError('');
  };

  // Admin login via Entra ID (mock SSO)
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setAdminError('Email is required'); return; }
    setAdminLogging(true);
    setAdminError('');
    try {
      // Step 1: Initiate Entra ID login (get auth code)
      const initResult = await api.initiateEntraLogin(email);
      // Step 2: Exchange auth code for session (mock callback)
      const callbackResult = await api.validateEntraCallback(initResult.code);
      if (callbackResult.authenticated) {
        loginAdmin(callbackResult.user);
        navigate('/amina');
      }
    } catch (err: any) {
      // Fallback to legacy password login
      try {
        const result = await api.adminLogin(email, password);
        if (result.authenticated) {
          loginAdmin(result.user);
          navigate('/amina');
          return;
        }
      } catch { /* ignore fallback failure */ }
      setAdminError(err?.message || 'Authentication failed');
    } finally {
      setAdminLogging(false);
    }
  };

  // Client wallet verification
  const checkWallet = useCallback(async () => {
    if (!publicKey || isAmina) return;
    setChecking(true);
    try {
      const result = await api.lookupWallet(publicKey.toBase58());
      if (result.authenticated) {
        setCredentialFound(true);
        setCredentialInfo(result);
      } else {
        setCredentialFound(false);
      }
    } catch {
      setCredentialFound(false);
    } finally {
      setChecking(false);
    }
  }, [publicKey, isAmina]);

  useEffect(() => {
    if (connected && publicKey && !isAmina) checkWallet();
    if (!connected) { setCredentialFound(false); setCredentialInfo(null); }
  }, [connected, publicKey, isAmina, checkWallet]);

  const handleEnterPortal = () => {
    if (credentialFound && credentialInfo?.credential) {
      const cred = credentialInfo.credential;
      loginClient(
        { walletAddress: publicKey!.toBase58(), credentialId: cred.credentialId, clientReference: cred.clientReference, jurisdiction: cred.jurisdiction, riskTier: cred.riskTier },
        credentialInfo.vault?.vaultId || null,
      );
    } else {
      loginClient({ walletAddress: publicKey!.toBase58() }, null);
    }
    navigate('/client');
  };

  const handleDemoLogin = () => {
    loginClient(
      { walletAddress: '0xA91F...72C3', credentialId: 'SAS-VAULT-001', clientReference: 'INST-2048', jurisdiction: 'Switzerland', riskTier: 'Conservative' },
      'VLT-001',
    );
    navigate('/client');
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#e5e7eb]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#3b82f6] transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        {isAmina ? (
          <>
            {/* AMINA Admin Login via Microsoft Entra ID */}
            <div className="text-center mb-10">
              {/* Microsoft Entra ID branding */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-10 h-10 rounded bg-[#00a4ef]/10 border border-[#00a4ef]/30 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                    <path d="M1 1h10v10H1z" fill="#f25022"/>
                    <path d="M12 1h10v10H12z" fill="#7fba00"/>
                    <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                    <path d="M12 12h10v10H12z" fill="#ffb900"/>
                  </svg>
                </div>
                <span className="text-lg font-semibold text-white">Microsoft Entra ID</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">AMINA Administration Console</h1>
              <p className="text-[#6b7280] max-w-lg mx-auto">
                Sign in with your enterprise identity via Microsoft Entra ID (SAML 2.0 Federation)
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-[10px] px-2 py-0.5 bg-[#00a4ef]/10 text-[#00a4ef] rounded border border-[#00a4ef]/30 font-medium">SAML 2.0</span>
                <span className="text-[10px] px-2 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-800/50 font-medium">KYC Verified</span>
                <span className="text-[10px] px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded border border-purple-800/50 font-medium">Enterprise SSO</span>
              </div>
            </div>

            <div className="max-w-lg mx-auto">
              {/* Role Selection — simulates Entra ID identity picker */}
              {!selectedRole ? (
                <div className="space-y-4">
                  {/* Entra ID identity picker mock */}
                  <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1f2937]">
                      <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      <span className="text-xs text-[#6b7280]">Pick an account to sign in to <span className="text-white font-medium">AMINA Bank AG</span></span>
                    </div>
                    <div className="space-y-1">
                      {AMINA_ROLE_CONFIG.map((config) => {
                        const Icon = config.icon;
                        const names: Record<string, string> = {
                          admin: 'Sarah Chen', portfolio_manager: 'Marcus Weber',
                          compliance_officer: 'Elena Rossi', emergency_admin: 'James Park',
                        };
                        return (
                          <button
                            key={config.role}
                            onClick={() => handleSelectRole(config)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#1f2937] transition-colors text-left group"
                          >
                            <div className="w-9 h-9 rounded-full bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4 text-[#3b82f6]" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">{names[config.role] || ROLE_LABELS[config.role]}</p>
                              <p className="text-xs text-[#6b7280]">{config.email}</p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#1f2937] text-[#6b7280] rounded group-hover:bg-[#374151]">
                              {ROLE_LABELS[config.role]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-[10px] text-[#6b7280] text-center">
                    Identity provided by Microsoft Entra ID (Mock SAML Federation)
                  </p>
                </div>
              ) : (
                /* Entra ID authentication in progress */
                <div className="space-y-5">
                  {/* Selected identity */}
                  <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1f2937]">
                      <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      <span className="text-xs text-[#6b7280]">Signing in to <span className="text-white font-medium">AMINA Bank AG</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#3b82f6]/20 flex items-center justify-center">
                          <selectedRole.icon className="w-5 h-5 text-[#3b82f6]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{
                            ({ admin: 'Sarah Chen', portfolio_manager: 'Marcus Weber', compliance_officer: 'Elena Rossi', emergency_admin: 'James Park' } as Record<string, string>)[selectedRole.role] || ''
                          }</p>
                          <p className="text-xs text-[#6b7280]">{selectedRole.email}</p>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedRole(null); setAdminError(''); }} className="text-xs text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                        Switch
                      </button>
                    </div>
                  </div>

                  {/* Entra ID verification status */}
                  <div className="bg-[#0a1628] border border-[#00a4ef]/20 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[#00a4ef]">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      Microsoft Entra ID Verification
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between"><span className="text-[#6b7280]">Provider</span><span className="text-white">Entra ID</span></div>
                      <div className="flex justify-between"><span className="text-[#6b7280]">Protocol</span><span className="text-white">SAML 2.0</span></div>
                      <div className="flex justify-between"><span className="text-[#6b7280]">Tenant</span><span className="text-white">amina.bank</span></div>
                      <div className="flex justify-between"><span className="text-[#6b7280]">MFA</span><span className="text-green-400">Verified</span></div>
                    </div>
                  </div>

                  {adminError && (
                    <p className="text-xs text-red-400 text-center">{adminError}</p>
                  )}

                  {/* Sign in button */}
                  <form onSubmit={handleAdminLogin}>
                    <button
                      type="submit"
                      disabled={adminLogging}
                      className="w-full bg-[#00a4ef] hover:bg-[#0090d4] disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {adminLogging ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating via Entra ID...</>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                            <path d="M1 1h10v10H1z" fill="#fff"/>
                            <path d="M12 1h10v10H12z" fill="#fff"/>
                            <path d="M1 12h10v10H1z" fill="#fff"/>
                            <path d="M12 12h10v10H12z" fill="#fff"/>
                          </svg>
                          Sign in with Microsoft Entra ID
                        </>
                      )}
                    </button>
                  </form>

                  <p className="text-[10px] text-[#6b7280] text-center">
                    Mock SSO — Authenticates via SAML 2.0 federation callback
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Client Portal Login */}
            <div className="text-center mb-10">
              <div className="w-14 h-14 rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/30 flex items-center justify-center mx-auto mb-6">
                <Wallet className="w-7 h-7 text-[#3b82f6]" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Institutional Client Portal</h1>
              <p className="text-[#6b7280] max-w-lg mx-auto">
                Connect your Solana wallet to access your segregated vault. Request credential access from inside the portal.
              </p>
            </div>

            <div className="max-w-md mx-auto space-y-5">
              <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6">
                <h3 className="text-sm font-semibold text-white mb-1">Connect Wallet</h3>
                <p className="text-xs text-[#6b7280] mb-4">Connect your Solana wallet to authenticate</p>
                <div className="flex justify-center">
                  <WalletMultiButton style={{ backgroundColor: '#3b82f6', borderRadius: '8px', height: '44px', fontSize: '14px', fontWeight: 600 }} />
                </div>
                {connected && publicKey && (
                  <div className="mt-3 bg-[#0a0e1a] rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-[#6b7280] uppercase tracking-wider">Connected</p>
                    <p className="text-xs font-mono text-white mt-1">{publicKey.toBase58()}</p>
                  </div>
                )}
              </div>

              {connected && !checking && (
                <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6">
                  {credentialFound && credentialInfo?.credential ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Credential Verified</span>
                      </div>
                      <div className="bg-[#0a0e1a] rounded-lg p-3 space-y-2">
                        {[
                          ['Credential', credentialInfo.credential.credentialId],
                          ['Client', credentialInfo.credential.clientReference],
                          ['Jurisdiction', credentialInfo.credential.jurisdiction],
                          ...(credentialInfo.vault ? [['Vault', credentialInfo.vault.vaultId]] : []),
                        ].map(([label, value]) => (
                          <div key={label as string} className="flex justify-between text-xs">
                            <span className="text-[#6b7280]">{label}</span>
                            <span className="text-white font-mono">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-amber-400 font-medium">No credential linked yet</p>
                      <p className="text-xs text-[#6b7280] mt-1">You can request credential access from inside the portal.</p>
                    </div>
                  )}
                </div>
              )}

              {connected && checking && (
                <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 flex items-center gap-3 text-[#6b7280]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking credential...</span>
                </div>
              )}

              {connected && !checking && (
                <button onClick={handleEnterPortal} className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-3.5 rounded-xl transition-colors text-sm">
                  {credentialFound ? 'Enter Client Portal' : 'Enter Portal & Request Access'}
                </button>
              )}

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-[#1f2937]" />
                <span className="text-xs text-[#6b7280]">or</span>
                <div className="flex-1 border-t border-[#1f2937]" />
              </div>

              <button onClick={handleDemoLogin} className="w-full bg-[#111827] border border-[#1f2937] hover:border-[#374151] text-white font-semibold py-3.5 rounded-xl transition-colors text-sm">
                Enter Demo Mode (INST-2048)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
