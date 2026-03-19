import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

interface StrategyConfig {
  id: string;
  name: string;
  defaultAlloc: number;
  blocked: boolean;
}

const STRATEGIES: StrategyConfig[] = [
  { id: 'STBL-YIELD-01', name: 'Stablecoin Lending', defaultAlloc: 60, blocked: false },
  { id: 'TRSY-YIELD-01', name: 'Tokenised Treasury', defaultAlloc: 40, blocked: false },
  { id: 'HIGH-DEFI-01', name: 'High Yield DeFi', defaultAlloc: 0, blocked: true },
];

const DEFAULT_WALLETS = ['0xDEST...4471', '0xCUST...1188', '0xBANK...9A01'];

export default function MandatePage() {
  const { activeVaultId, notify } = useStore();

  const [allocA, setAllocA] = useState(60);
  const [allocB, setAllocB] = useState(40);
  const [blockedC, setBlockedC] = useState(true);
  const [consentThreshold, setConsentThreshold] = useState(250000);
  const [idleBuffer, setIdleBuffer] = useState(10);
  const [leverageAllowed, setLeverageAllowed] = useState(false);
  const [wallets, setWallets] = useState<string[]>(DEFAULT_WALLETS);
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-500 text-sm">No vault selected.</p>
          <p className="text-slate-500 text-xs mt-1">
            Select an active vault from the dashboard to configure its mandate.
          </p>
        </div>
      </div>
    );
  }

  const updateWallet = (index: number, value: string) => {
    const next = [...wallets];
    next[index] = value;
    setWallets(next);
  };

  const addWallet = () => setWallets([...wallets, '']);

  const removeWallet = (index: number) => {
    if (wallets.length <= 1) return;
    setWallets(wallets.filter((_, i) => i !== index));
  };

  const handleApply = async () => {
    setSubmitting(true);
    try {
      const allowedStrategies = ['STBL-YIELD-01', 'TRSY-YIELD-01'].filter(
        () => true,
      );
      const blockedStrategies = blockedC ? ['HIGH-DEFI-01'] : [];

      await api.attachMandate(activeVaultId, {
        allowedStrategies,
        blockedStrategies,
        maxAllocationBps: {
          'STBL-YIELD-01': allocA * 100,
          'TRSY-YIELD-01': allocB * 100,
          'HIGH-DEFI-01': 0,
        },
        liquidityBufferBps: idleBuffer * 100,
        consentThreshold,
        leverageAllowed,
        approvedDestinations: wallets.filter((w) => w.trim() !== ''),
      });

      setApplied(true);
      notify('success', 'Mandate applied successfully');
    } catch (err: any) {
      notify('error', err?.message || 'Failed to apply mandate');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Mandate and Policy Engine</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure investment mandate restrictions for vault {activeVaultId}
        </p>
      </div>

      {/* Strategy Allocation Form */}
      <Card title="Strategy Allocation Limits" subtitle="Set maximum allocation per strategy">
        <div className="space-y-5">
          {/* Strategy A */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink-900">
                Stablecoin Lending
                <span className="ml-1.5 text-slate-500 font-mono text-[10px]">STBL-YIELD-01</span>
              </label>
              <span className="text-xs font-mono text-ink-900">{allocA}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={allocA}
              onChange={(e) => setAllocA(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-[12px] appearance-none cursor-pointer accent-teal-700"
            />
          </div>

          {/* Strategy B */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink-900">
                Tokenised Treasury
                <span className="ml-1.5 text-slate-500 font-mono text-[10px]">TRSY-YIELD-01</span>
              </label>
              <span className="text-xs font-mono text-ink-900">{allocB}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={allocB}
              onChange={(e) => setAllocB(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-[12px] appearance-none cursor-pointer accent-teal-700"
            />
          </div>

          {/* Strategy C — blocked toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-ink-900">
                High Yield DeFi
                <span className="ml-1.5 text-slate-500 font-mono text-[10px]">HIGH-DEFI-01</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBlockedC(!blockedC)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                blockedC ? 'bg-red-700' : 'bg-green-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  blockedC ? 'translate-x-1' : 'translate-x-[18px]'
                }`}
              />
            </button>
            <span className="text-[10px] font-medium ml-2 min-w-[56px]">
              {blockedC ? (
                <span className="text-error-700">BLOCKED</span>
              ) : (
                <span className="text-success-700">ALLOWED</span>
              )}
            </span>
          </div>
        </div>
      </Card>

      {/* Policy Controls */}
      <Card title="Policy Controls" subtitle="Consent thresholds and risk limits">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-900 mb-1">Consent Threshold (USDC)</label>
            <input
              type="number"
              value={consentThreshold}
              onChange={(e) => setConsentThreshold(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-900 mb-1">Min Idle Buffer (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={idleBuffer}
              onChange={(e) => setIdleBuffer(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-[12px] px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div className="flex items-center justify-between sm:col-span-2">
            <label className="text-xs text-ink-900">Leverage Allowed</label>
            <button
              type="button"
              onClick={() => setLeverageAllowed(!leverageAllowed)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                leverageAllowed ? 'bg-green-700' : 'bg-slate-400'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  leverageAllowed ? 'translate-x-[18px]' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-[10px] font-medium ml-2 min-w-[24px]">
              {leverageAllowed ? (
                <span className="text-success-700">Yes</span>
              ) : (
                <span className="text-slate-500">No</span>
              )}
            </span>
          </div>
        </div>
      </Card>

      {/* Approved Destination Wallets */}
      <Card title="Approved Destination Wallets" subtitle="Only these wallets may receive funds">
        <div className="space-y-2">
          {wallets.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={w}
                onChange={(e) => updateWallet(i, e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-white border border-slate-200 rounded-[12px] px-3 py-1.5 text-sm text-ink-900 font-mono focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
              <button
                type="button"
                onClick={() => removeWallet(i)}
                disabled={wallets.length <= 1}
                className="text-xs text-error-700 hover:text-red-500 disabled:text-slate-400 disabled:cursor-not-allowed px-1"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addWallet}
            className="text-xs text-teal-700 hover:text-teal-800 mt-1"
          >
            + Add wallet
          </button>
        </div>
      </Card>

      {/* Apply Button */}
      <div>
        <button
          onClick={handleApply}
          disabled={submitting}
          className="px-5 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-900 disabled:cursor-not-allowed text-white text-sm font-medium rounded-[12px] transition-all ease-amina duration-150"
        >
          {submitting ? 'Applying...' : 'Apply Mandate'}
        </button>
      </div>

      {/* Strategy Permissions Table */}
      <Card title="Strategy Permissions" subtitle="Current allocation and status overview">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Strategy</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Max Allocation</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr className="border-b border-slate-200/50">
                <td className="py-2 pr-4">
                  <span className="text-ink-900">Stablecoin Lending</span>
                  <span className="ml-1.5 text-slate-500 font-mono text-[10px]">STBL-YIELD-01</span>
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status="approved" />
                </td>
                <td className="py-2 font-mono text-ink-900">{allocA}%</td>
              </tr>
              <tr className="border-b border-slate-200/50">
                <td className="py-2 pr-4">
                  <span className="text-ink-900">Tokenised Treasury</span>
                  <span className="ml-1.5 text-slate-500 font-mono text-[10px]">TRSY-YIELD-01</span>
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status="approved" />
                </td>
                <td className="py-2 font-mono text-ink-900">{allocB}%</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">
                  <span className="text-ink-900">High Yield DeFi</span>
                  <span className="ml-1.5 text-slate-500 font-mono text-[10px]">HIGH-DEFI-01</span>
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={blockedC ? 'blocked' : 'approved'} />
                </td>
                <td className="py-2 font-mono text-ink-900">0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Policy Summary */}
      {applied && (
        <Card title="Policy Summary" subtitle="Plain-English mandate restrictions">
          <ul className="space-y-1.5 text-xs text-ink-900 list-disc list-inside">
            <li>
              Stablecoin Lending (STBL-YIELD-01) is permitted with a maximum allocation of{' '}
              <span className="text-ink-900 font-medium">{allocA}%</span>.
            </li>
            <li>
              Tokenised Treasury (TRSY-YIELD-01) is permitted with a maximum allocation of{' '}
              <span className="text-ink-900 font-medium">{allocB}%</span>.
            </li>
            <li>
              High Yield DeFi (HIGH-DEFI-01) is{' '}
              {blockedC ? (
                <span className="text-error-700 font-medium">blocked</span>
              ) : (
                <span className="text-success-700 font-medium">allowed</span>
              )}
              .
            </li>
            <li>
              Transactions above{' '}
              <span className="text-ink-900 font-medium">
                {consentThreshold.toLocaleString()} USDC
              </span>{' '}
              require explicit consent approval.
            </li>
            <li>
              A minimum idle buffer of{' '}
              <span className="text-ink-900 font-medium">{idleBuffer}%</span> must be maintained at
              all times.
            </li>
            <li>
              Leverage is{' '}
              {leverageAllowed ? (
                <span className="text-warning-700 font-medium">permitted</span>
              ) : (
                <span className="text-success-700 font-medium">not permitted</span>
              )}
              .
            </li>
            <li>
              Approved destination wallets:{' '}
              <span className="text-ink-900 font-mono text-[10px]">
                {wallets.filter((w) => w.trim()).join(', ')}
              </span>
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}
