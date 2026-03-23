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

  const [selectedRole, setSelectedRole] = useState<(typeof AMINA_ROLE_CONFIG)[number] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminLogging, setAdminLogging] = useState(false);
  const [adminError, setAdminError] = useState('');

  const [checking, setChecking] = useState(false);
  const [credentialFound, setCredentialFound] = useState(false);
  const [credentialInfo, setCredentialInfo] = useState<any>(null);

  const isAmina = portal === 'amina';

  const handleSelectRole = (config: (typeof AMINA_ROLE_CONFIG)[number]) => {
    setSelectedRole(config);
    setEmail(config.email);
    setPassword(config.password);
    setAdminError('');
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setAdminError('Email is required'); return; }
    setAdminLogging(true);
    setAdminError('');
    try {
      const initResult = await api.initiateEntraLogin(email);
      const callbackResult = await api.validateEntraCallback(initResult.code);
      if (callbackResult.authenticated) {
        loginAdmin(callbackResult.user);
        navigate('/amina');
      }
    } catch (err: any) {
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
    <div className="min-h-screen bg-amina-surface-secondary text-ink-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-700 transition-colors mb-12">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        {isAmina ? (
          <>
            {/* AMINA Admin Login */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-[12px] bg-info-100 border border-info-700/20 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                    <path d="M1 1h10v10H1z" fill="#f25022"/>
                    <path d="M12 1h10v10H12z" fill="#7fba00"/>
                    <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                    <path d="M12 12h10v10H12z" fill="#ffb900"/>
                  </svg>
                </div>
                <span className="text-lg font-semibold text-ink-900">Microsoft Entra ID</span>
              </div>
              <h1 className="text-3xl font-display font-bold text-ink-900 mb-2">AMINA Administration Console</h1>
              <p className="text-slate-600 max-w-lg mx-auto">
                Sign in with your enterprise identity via Microsoft Entra ID (SAML 2.0 Federation)
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <span className="text-[10px] px-2 py-0.5 bg-info-100 text-info-700 rounded-md border border-info-700/20 font-medium">SAML 2.0</span>
                <span className="text-[10px] px-2 py-0.5 bg-success-100 text-success-700 rounded-md border border-success-700/20 font-medium">KYC Verified</span>
                <span className="text-[10px] px-2 py-0.5 bg-review-100 text-review-700 rounded-md border border-review-700/20 font-medium">Enterprise SSO</span>
              </div>
            </div>

            <div className="max-w-lg mx-auto">
              {!selectedRole ? (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-[18px] p-4 shadow-1">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200">
                      <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      <span className="text-xs text-slate-500">Pick an account to sign in to <span className="text-ink-900 font-medium">AMINA Bank AG</span></span>
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
                            className="w-full flex items-center gap-3 p-3 rounded-[12px] hover:bg-teal-50 transition-all ease-amina duration-150 text-left group"
                          >
                            <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4 text-teal-700" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-ink-900">{names[config.role] || ROLE_LABELS[config.role]}</p>
                              <p className="text-xs text-slate-500">{config.email}</p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md group-hover:bg-teal-100 group-hover:text-teal-700">
                              {ROLE_LABELS[config.role]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    Identity provided by Microsoft Entra ID (Mock SAML Federation)
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-white border border-slate-200 rounded-[18px] p-4 shadow-1">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200">
                      <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      <span className="text-xs text-slate-500">Signing in to <span className="text-ink-900 font-medium">AMINA Bank AG</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                          <selectedRole.icon className="w-5 h-5 text-teal-700" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink-900">{
                            ({ admin: 'Sarah Chen', portfolio_manager: 'Marcus Weber', compliance_officer: 'Elena Rossi', emergency_admin: 'James Park' } as Record<string, string>)[selectedRole.role] || ''
                          }</p>
                          <p className="text-xs text-slate-500">{selectedRole.email}</p>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedRole(null); setAdminError(''); }} className="text-xs text-slate-500 hover:text-teal-700 transition-colors">
                        Switch
                      </button>
                    </div>
                  </div>

                  <div className="bg-teal-50 border border-teal-300/30 rounded-[18px] p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-teal-700">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 23 23" fill="none">
                        <path d="M1 1h10v10H1z" fill="#f25022"/>
                        <path d="M12 1h10v10H12z" fill="#7fba00"/>
                        <path d="M1 12h10v10H1z" fill="#00a4ef"/>
                        <path d="M12 12h10v10H12z" fill="#ffb900"/>
                      </svg>
                      Microsoft Entra ID Verification
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="text-ink-900">Entra ID</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Protocol</span><span className="text-ink-900">SAML 2.0</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="text-ink-900">amina.bank</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">MFA</span><span className="text-success-700">Verified</span></div>
                    </div>
                  </div>

                  {adminError && (
                    <p className="text-xs text-error-700 text-center">{adminError}</p>
                  )}

                  <form onSubmit={handleAdminLogin}>
                    <button
                      type="submit"
                      disabled={adminLogging}
                      className="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-semibold py-3 rounded-[12px] transition-all ease-amina duration-150 flex items-center justify-center gap-2 shadow-1"
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

                  <p className="text-[10px] text-slate-400 text-center">
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
              <div className="w-14 h-14 rounded-[18px] bg-teal-100 border border-teal-300/40 flex items-center justify-center mx-auto mb-6">
                <Wallet className="w-7 h-7 text-teal-700" />
              </div>
              <h1 className="text-3xl font-display font-bold text-ink-900 mb-2">Institutional Client Portal</h1>
              <p className="text-slate-600 max-w-lg mx-auto">
                Connect your Solana wallet to access your segregated vault. Request credential access from inside the portal.
              </p>
            </div>

            <div className="max-w-md mx-auto space-y-5">
              <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
                <h3 className="text-sm font-semibold text-ink-900 mb-1">Connect Wallet</h3>
                <p className="text-xs text-slate-500 mb-4">Connect your Solana wallet to authenticate</p>
                <div className="flex justify-center">
                  <WalletMultiButton style={{ backgroundColor: '#0D636B', borderRadius: '12px', height: '44px', fontSize: '14px', fontWeight: 600 }} />
                </div>
                {connected && publicKey && (
                  <div className="mt-3 bg-teal-50 rounded-[12px] p-2.5 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Connected</p>
                    <p className="text-xs font-mono text-ink-900 mt-1">{publicKey.toBase58()}</p>
                  </div>
                )}
              </div>

              {connected && !checking && (
                <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1">
                  {credentialFound && credentialInfo?.credential ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-success-700">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Credential Verified</span>
                      </div>
                      <div className="bg-teal-50 rounded-[12px] p-3 space-y-2">
                        {[
                          ['Credential', credentialInfo.credential.credentialId],
                          ['Client', credentialInfo.credential.clientReference],
                          ['Jurisdiction', credentialInfo.credential.jurisdiction],
                          ...(credentialInfo.vault ? [['Vault', credentialInfo.vault.vaultId]] : []),
                        ].map(([label, value]) => (
                          <div key={label as string} className="flex justify-between text-xs">
                            <span className="text-slate-500">{label}</span>
                            <span className="text-ink-900 font-mono">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-warning-700 font-medium">No credential linked yet</p>
                      <p className="text-xs text-slate-500 mt-1">You can request credential access from inside the portal.</p>
                    </div>
                  )}
                </div>
              )}

              {connected && checking && (
                <div className="bg-white border border-slate-200 rounded-[18px] p-6 shadow-1 flex items-center gap-3 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking credential...</span>
                </div>
              )}

              {connected && !checking && (
                <button onClick={handleEnterPortal} className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold py-3.5 rounded-[12px] transition-all ease-amina duration-150 text-sm shadow-1">
                  {credentialFound ? 'Enter Client Portal' : 'Enter Portal & Request Access'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
