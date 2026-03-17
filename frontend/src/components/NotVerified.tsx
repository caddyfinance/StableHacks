import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ShieldOff, ArrowRight } from 'lucide-react';

export default function NotVerified() {
  const { clientInfo, logout } = useStore();
  const navigate = useNavigate();

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-900/20 border border-red-800/40 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-red-400" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-white mb-2">Wallet Not Verified</h2>
          <p className="text-sm text-gray-400">
            This wallet does not have a valid SAS credential issued by AMINA. You cannot access vault operations without an active institutional credential.
          </p>
        </div>

        {clientInfo?.walletAddress && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Connected Wallet</span>
              <span className="text-white font-mono text-[11px]">
                {clientInfo.walletAddress.length > 20
                  ? `${clientInfo.walletAddress.slice(0, 8)}...${clientInfo.walletAddress.slice(-8)}`
                  : clientInfo.walletAddress}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Credential Status</span>
              <span className="text-red-400 font-medium">Not Found</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">On-Chain Attestation</span>
              <span className="text-red-400 font-medium">None</span>
            </div>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left">
          <p className="text-xs text-gray-400 mb-3">To access the Client Portal:</p>
          <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
            <li>Contact AMINA administration to request institutional access</li>
            <li>AMINA will issue a SAS credential bound to your Solana wallet</li>
            <li>Return here and connect the same wallet to access your vault</li>
          </ol>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/client/request-credential')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Request Credential Access
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
