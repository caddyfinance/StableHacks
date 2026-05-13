import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ShieldOff, ArrowRight } from 'lucide-react';

export default function NotVerified({ revoked = false }: { revoked?: boolean }) {
  const { clientInfo, logout } = useStore();
  const navigate = useNavigate();

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-error-100 border border-error-700/20 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-error-700" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-ink-900 mb-2">
            {revoked ? 'Credential Revoked' : 'Wallet Not Verified'}
          </h2>
          <p className="text-sm text-slate-700">
            {revoked
              ? 'Your SAS credential has been revoked by AMINA. Vault access has been suspended. You may request a new credential to regain access.'
              : 'This wallet does not have a valid SAS credential issued by AMINA. You cannot access vault operations without an active institutional credential.'}
          </p>
        </div>

        {clientInfo?.walletAddress && (
          <div className="bg-white border border-slate-200 rounded-[18px] p-4 text-left space-y-2 shadow-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Connected Wallet</span>
              <span className="text-ink-900 font-mono text-[11px]">
                {clientInfo.walletAddress.length > 20
                  ? `${clientInfo.walletAddress.slice(0, 8)}...${clientInfo.walletAddress.slice(-8)}`
                  : clientInfo.walletAddress}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Credential Status</span>
              <span className="text-error-700 font-medium">{revoked ? 'Revoked' : 'Not Found'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">On-Chain Attestation</span>
              <span className="text-error-700 font-medium">{revoked ? 'Revoked' : 'None'}</span>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-[18px] p-4 text-left shadow-1">
          <p className="text-xs text-slate-700 mb-3">
            {revoked ? 'To restore access:' : 'To access the Client Portal:'}
          </p>
          <ol className="text-xs text-slate-700 space-y-1.5 list-decimal list-inside">
            <li>Contact AMINA administration to request institutional access</li>
            <li>AMINA will issue a SAS credential bound to your Solana wallet</li>
            <li>Return here and connect the same wallet to access your vault</li>
          </ol>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/client/request-credential')}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-[12px] transition-all shadow-1"
          >
            Request Credential Access
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="px-4 py-2.5 text-sm text-slate-700 hover:text-ink-900 border border-slate-200 rounded-[12px] transition-all"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
