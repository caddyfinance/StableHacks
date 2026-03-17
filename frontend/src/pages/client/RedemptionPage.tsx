import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';

interface Snapshot {
  totalNav: number;
  idleBalance: number;
  deployedBalance: number;
  baseAsset: string;
}

interface Mandate {
  approvedDestinations: string[];
  status: string;
}

import NotVerified from '../../components/NotVerified';

export default function RedemptionPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(false);

  // Redemption form
  const [amount, setAmount] = useState('');
  const [destinationWallet, setDestinationWallet] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    newBalance?: number;
  } | null>(null);

  // Auto-select vault if none active
  useEffect(() => {
    if (!activeVaultId) {
      setAutoLoading(true);
      api.getVaults()
        .then((vaults) => {
          if (vaults.length > 0) {
            setActiveVaultId(vaults[0].vaultId ?? vaults[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setAutoLoading(false));
    }
  }, [activeVaultId, setActiveVaultId]);

  useEffect(() => {
    if (activeVaultId) loadData();
  }, [activeVaultId]);

  async function loadData() {
    setLoading(true);
    try {
      const [snap, mand] = await Promise.all([
        api.getSnapshot(activeVaultId!),
        api.getMandate(activeVaultId!),
      ]);
      setSnapshot(snap);
      setMandate(mand);
      if (mand.approvedDestinations?.length > 0 && !destinationWallet) {
        setDestinationWallet(mand.approvedDestinations[0]);
      }
    } catch {
      notify('error', 'Failed to load vault data');
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeem() {
    if (!activeVaultId) return;
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      notify('error', 'Enter a valid redemption amount');
      return;
    }
    if (!destinationWallet) {
      notify('error', 'Select a destination wallet');
      return;
    }

    setRedeeming(true);
    setResult(null);
    try {
      const res = await api.redeem(activeVaultId, {
        amount: parsedAmount,
        destinationWallet,
      });
      const newBal = res.balance ?? res.idleBalance;
      setResult({
        success: true,
        message: 'Redemption executed successfully.',
        newBalance: newBal,
      });
      notify('success', 'Redemption executed');
      setAmount('');
      // Refresh snapshot to show new balances
      try {
        const freshSnap = await api.getSnapshot(activeVaultId);
        setSnapshot(freshSnap);
      } catch {}
    } catch (err: any) {
      const reason =
        err?.reason || err?.message || 'Destination not approved or request blocked';
      setResult({ success: false, message: reason });
      notify('error', `Redemption failed: ${reason}`);
    } finally {
      setRedeeming(false);
    }
  }

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-vault-muted text-sm">
            No vault selected. Your vault will be loaded automatically.
          </p>
          {autoLoading && (
            <p className="text-vault-muted text-xs mt-2 animate-pulse">Loading vaults...</p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-vault-muted text-sm animate-pulse">Loading redemption data...</p>
      </div>
    );
  }

  const baseAsset = snapshot?.baseAsset ?? 'USDC';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Redemption</h1>
        <p className="text-sm text-vault-muted mt-1">
          Withdraw funds to pre-approved destination wallets
        </p>
      </div>

      {/* Current Balances */}
      <Card title="Current Balances" subtitle="Available funds in your vault">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">
              Total NAV
            </p>
            <p className="text-xl font-bold text-white font-mono">
              {snapshot?.totalNav?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '0.00'}
            </p>
            <p className="text-xs text-vault-muted">{baseAsset}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">
              Idle Balance
            </p>
            <p className="text-lg font-semibold text-green-400 font-mono">
              {snapshot?.idleBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '0.00'}
            </p>
            <p className="text-xs text-vault-muted">Available for withdrawal</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-1">
              Deployed Balance
            </p>
            <p className="text-lg font-semibold text-vault-muted font-mono">
              {snapshot?.deployedBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '0.00'}
            </p>
            <p className="text-xs text-vault-muted">In active strategies</p>
          </div>
        </div>
      </Card>

      {/* Redemption Form */}
      <Card title="Execute Redemption" subtitle="Submit a withdrawal request">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-vault-muted mb-1">
              Amount ({baseAsset})
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded bg-vault-bg border border-vault-border text-white text-sm placeholder:text-vault-muted/50 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-vault-muted mb-1">
              Destination Wallet
            </label>
            {mandate && mandate.approvedDestinations.length > 0 ? (
              <select
                value={destinationWallet}
                onChange={(e) => setDestinationWallet(e.target.value)}
                className="w-full px-3 py-2 rounded bg-vault-bg border border-vault-border text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              >
                {mandate.approvedDestinations.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-red-400">
                No approved destinations configured. Contact your relationship manager.
              </p>
            )}
          </div>

          <button
            onClick={handleRedeem}
            disabled={
              redeeming ||
              !amount ||
              !destinationWallet ||
              !mandate?.approvedDestinations.length
            }
            className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {redeeming ? 'Executing Redemption...' : 'Execute Redemption'}
          </button>

          {/* Result */}
          {result && (
            <div
              className={`rounded p-3 text-sm ${
                result.success
                  ? 'bg-green-900/20 border border-green-800 text-green-400'
                  : 'bg-red-900/20 border border-red-800 text-red-400'
              }`}
            >
              <p className="font-semibold">
                {result.success ? 'Redemption Successful' : 'Redemption Failed'}
              </p>
              <p className="text-xs mt-1 opacity-80">{result.message}</p>
              {result.success && result.newBalance !== undefined && (
                <p className="text-xs mt-2 text-vault-muted">
                  Updated idle balance:{' '}
                  <span className="text-white font-mono">
                    {result.newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>{' '}
                  {baseAsset}
                </p>
              )}
            </div>
          )}

          {/* Withdrawal notice */}
          <div className="px-3 py-2 rounded bg-yellow-900/15 border border-yellow-800/40">
            <p className="text-xs text-yellow-300">
              Withdrawals are only permitted to pre-approved destination wallets as defined in the vault mandate.
            </p>
          </div>
        </div>
      </Card>

      {/* Approved Destinations */}
      <Card title="Approved Destinations" subtitle="Wallets authorized for withdrawals">
        {!mandate || mandate.approvedDestinations.length === 0 ? (
          <p className="text-xs text-vault-muted">
            No approved destinations configured for this vault.
          </p>
        ) : (
          <ul className="space-y-2">
            {mandate.approvedDestinations.map((wallet, i) => (
              <li
                key={wallet}
                className="flex items-center gap-3 px-3 py-2 rounded bg-vault-bg border border-vault-border"
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-green-900/40 text-green-400 text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="font-mono text-xs text-white break-all">{wallet}</span>
                <span className="ml-auto">
                  <StatusBadge status="approved" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
