import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

interface VaultSnapshot {
  paused: boolean;
  idleBalance: number;
  totalBalance: number;
}

interface Strategy {
  strategyId: string;
  name: string;
  status: string;
  disabled: boolean;
  allocatedAmount?: number;
}

export default function EmergencyPage() {
  const { activeVaultId, notify } = useStore();

  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [loadingStrategies, setLoadingStrategies] = useState(true);
  const [togglingPause, setTogglingPause] = useState(false);
  const [togglingStrategyId, setTogglingStrategyId] = useState<string | null>(null);

  // Unwind state
  const [unwindStrategyId, setUnwindStrategyId] = useState('');
  const [unwinding, setUnwinding] = useState(false);
  const [unwindResult, setUnwindResult] = useState<{
    success: boolean;
    message: string;
    amountReturned?: number;
  } | null>(null);

  useEffect(() => {
    if (activeVaultId) {
      loadSnapshot();
      loadStrategies();
    }
  }, [activeVaultId]);

  async function loadSnapshot() {
    if (!activeVaultId) return;
    setLoadingSnapshot(true);
    try {
      const data = await api.getSnapshot(activeVaultId);
      setSnapshot(data);
    } catch {
      notify('error', 'Failed to load vault snapshot');
    } finally {
      setLoadingSnapshot(false);
    }
  }

  async function loadStrategies() {
    setLoadingStrategies(true);
    try {
      const data = await api.getStrategies();
      setStrategies(data);
    } catch {
      notify('error', 'Failed to load strategies');
    } finally {
      setLoadingStrategies(false);
    }
  }

  async function handleTogglePause() {
    if (!activeVaultId) return;
    setTogglingPause(true);
    try {
      const result = await api.togglePause(activeVaultId);
      const nowPaused = result.paused ?? !snapshot?.paused;
      setSnapshot((prev) => (prev ? { ...prev, paused: nowPaused } : prev));
      notify('success', nowPaused ? 'Vault paused' : 'Vault unpaused');
    } catch {
      notify('error', 'Failed to toggle vault pause state');
    } finally {
      setTogglingPause(false);
    }
  }

  async function handleToggleStrategy(strategyId: string, currentDisabled: boolean) {
    setTogglingStrategyId(strategyId);
    try {
      await api.toggleStrategy(strategyId, !currentDisabled);
      setStrategies((prev) =>
        prev.map((s) =>
          s.strategyId === strategyId
            ? {
                ...s,
                disabled: !currentDisabled,
                status: !currentDisabled ? 'disabled' : 'active',
              }
            : s
        )
      );
      notify(
        'success',
        `Strategy ${!currentDisabled ? 'disabled' : 'enabled'}`
      );
    } catch {
      notify('error', 'Failed to toggle strategy');
    } finally {
      setTogglingStrategyId(null);
    }
  }

  async function handleUnwind() {
    if (!activeVaultId || !unwindStrategyId) return;
    setUnwinding(true);
    setUnwindResult(null);
    try {
      const result = await api.unwind(activeVaultId, {
        strategyId: unwindStrategyId,
      });
      setUnwindResult({
        success: true,
        message: 'Unwind completed successfully',
        amountReturned: result.amountReturned ?? result.amount,
      });
      notify('success', 'Strategy unwind completed');
      loadSnapshot();
      loadStrategies();
    } catch (err: any) {
      const reason = err?.reason || err?.message || 'Unwind failed';
      setUnwindResult({ success: false, message: reason });
      notify('error', `Unwind failed: ${reason}`);
    } finally {
      setUnwinding(false);
    }
  }

  const activeStrategies = strategies.filter(
    (s) => (s.allocatedAmount ?? 0) > 0 && !s.disabled
  );

  if (!activeVaultId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-700 text-sm">
          Select a vault to access emergency controls.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Emergency Controls</h1>
        <p className="text-sm text-slate-700 mt-1">
          Pause operations, disable adapters, and initiate strategy unwinds.
        </p>
      </div>

      {/* Section 1: Vault Pause Controls */}
      <Card title="Vault Pause Controls" subtitle="Immediately halt all vault operations">
        {loadingSnapshot ? (
          <p className="text-xs text-slate-700">Loading vault state...</p>
        ) : !snapshot ? (
          <p className="text-xs text-slate-700">Unable to load vault snapshot.</p>
        ) : (
          <div className="space-y-4">
            {/* Pause state indicator */}
            <div className="flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  snapshot.paused ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}
              />
              <span className="text-sm font-semibold text-ink-900">
                Vault is{' '}
                <span
                  className={snapshot.paused ? 'text-error-700' : 'text-success-700'}
                >
                  {snapshot.paused ? 'PAUSED' : 'ACTIVE'}
                </span>
              </span>
            </div>

            {snapshot.paused && (
              <div className="rounded-[12px] bg-error-100 border border-red-800 px-3 py-2">
                <p className="text-xs text-error-700 font-medium">
                  When paused, all allocations and deposits are blocked.
                </p>
              </div>
            )}

            <button
              onClick={handleTogglePause}
              disabled={togglingPause}
              className={`w-full py-3 rounded-[12px] text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                snapshot.paused
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-error-700 hover:bg-error-700/90 text-white'
              }`}
            >
              {togglingPause
                ? 'Processing...'
                : snapshot.paused
                ? 'Unpause Vault'
                : 'Pause Vault'}
            </button>
          </div>
        )}
      </Card>

      {/* Section 2: Adapter Disable Controls */}
      <Card
        title="Adapter Disable Controls"
        subtitle="Enable or disable individual strategy adapters"
      >
        {loadingStrategies ? (
          <p className="text-xs text-slate-700">Loading strategies...</p>
        ) : strategies.length === 0 ? (
          <p className="text-xs text-slate-700">No strategies configured.</p>
        ) : (
          <div className="space-y-2">
            {strategies.map((strategy) => (
              <div
                key={strategy.strategyId}
                className="flex items-center justify-between px-3 py-2.5 rounded-[12px] bg-teal-50 border border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-900 font-medium">
                    {strategy.name}
                  </span>
                  <StatusBadge
                    status={strategy.disabled ? 'disabled' : strategy.status}
                  />
                </div>
                <button
                  onClick={() =>
                    handleToggleStrategy(strategy.strategyId, strategy.disabled)
                  }
                  disabled={togglingStrategyId === strategy.strategyId}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-[12px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    strategy.disabled
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-error-700 hover:bg-error-700/90 text-white'
                  }`}
                >
                  {togglingStrategyId === strategy.strategyId
                    ? 'Processing...'
                    : strategy.disabled
                    ? 'Enable'
                    : 'Disable'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Section 3: Unwind Controls */}
      <Card
        title="Unwind Controls"
        subtitle="Return allocated funds from a strategy back to idle"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-700 mb-1">
              Strategy (active allocations only)
            </label>
            {activeStrategies.length === 0 ? (
              <p className="text-xs text-slate-700">
                No strategies with active allocations.
              </p>
            ) : (
              <select
                value={unwindStrategyId}
                onChange={(e) => setUnwindStrategyId(e.target.value)}
                className="w-full px-3 py-2 rounded-[12px] bg-white border border-slate-200 text-ink-900 text-sm focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 transition-colors"
              >
                <option value="">Select a strategy</option>
                {activeStrategies.map((s) => (
                  <option key={s.strategyId} value={s.strategyId}>
                    {s.name}{' '}
                    {s.allocatedAmount !== undefined
                      ? `(${s.allocatedAmount.toLocaleString()} allocated)`
                      : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={handleUnwind}
            disabled={unwinding || !unwindStrategyId}
            className="w-full py-2 rounded-[12px] bg-warning-700 hover:bg-warning-700/90 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {unwinding ? 'Initiating Unwind...' : 'Initiate Unwind'}
          </button>

          {unwindResult && (
            <div
              className={`rounded-[12px] p-3 text-sm ${
                unwindResult.success
                  ? 'bg-success-100 border border-success-700/20 text-success-700'
                  : 'bg-error-100 border border-red-800 text-error-700'
              }`}
            >
              <p className="font-semibold">
                {unwindResult.success ? 'Unwind Successful' : 'Unwind Failed'}
              </p>
              <p className="text-xs mt-1 opacity-80">{unwindResult.message}</p>
              {unwindResult.success && unwindResult.amountReturned !== undefined && (
                <p className="text-xs mt-2 text-slate-700">
                  Amount returned to idle:{' '}
                  <span className="text-ink-900 font-mono">
                    {unwindResult.amountReturned.toLocaleString()}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
