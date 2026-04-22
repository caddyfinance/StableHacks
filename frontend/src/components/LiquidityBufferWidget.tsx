import { useState, useRef } from 'react';
import { ShieldCheck, Lock, TrendingUp, AlertTriangle, Info } from 'lucide-react';

interface LiquidityBufferWidgetProps {
  totalNAV: number;
  idleBalance: number;
  requiredBuffer: number;
  deployableBalance: number;
  bufferUtilization: number;
  bufferBps: number;
  variant?: 'admin' | 'client';
}

const fmt = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getHealthColor(utilization: number): { bar: string; text: string; bg: string; border: string } {
  if (utilization >= 150) return { bar: 'bg-success-700', text: 'text-success-700', bg: 'bg-success-100', border: 'border-success-700/30' };
  if (utilization >= 100) return { bar: 'bg-teal-700', text: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-700/30' };
  if (utilization >= 90)  return { bar: 'bg-warning-700', text: 'text-warning-700', bg: 'bg-warning-100', border: 'border-warning-700/30' };
  return { bar: 'bg-error-700', text: 'text-error-700', bg: 'bg-error-100', border: 'border-error-700/30' };
}

function getHealthLabel(utilization: number): string {
  if (utilization >= 150) return 'Healthy';
  if (utilization >= 100) return 'Adequate';
  if (utilization >= 90)  return 'Low';
  return 'Critical';
}

interface InlineTooltipProps {
  children: React.ReactNode;
  content: string;
}

function InlineTooltip({ children, content }: InlineTooltipProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 whitespace-nowrap rounded-[8px] bg-ink-900 text-white text-[10px] px-2.5 py-1.5 shadow-lg pointer-events-none">
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-900" />
        </span>
      )}
    </span>
  );
}

export default function LiquidityBufferWidget({
  totalNAV,
  idleBalance,
  requiredBuffer,
  deployableBalance,
  bufferUtilization,
  bufferBps,
  variant = 'admin',
}: LiquidityBufferWidgetProps) {
  const bufferPct = bufferBps / 100;
  const health = getHealthColor(bufferUtilization);
  const healthLabel = getHealthLabel(bufferUtilization);
  const lockedBuffer = Math.min(idleBalance, requiredBuffer);
  const fillPct = Math.min(100, totalNAV > 0 ? (idleBalance / totalNAV) * 100 : 0);
  const requiredFillPct = totalNAV > 0 ? (requiredBuffer / totalNAV) * 100 : 0;
  const deployedPct = Math.max(0, 100 - fillPct);

  // Bar hover tooltip state
  const barRef = useRef<HTMLDivElement>(null);
  const [barTooltip, setBarTooltip] = useState<{ x: number; label: string } | null>(null);

  const handleBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const x = e.clientX - rect.left;

    let label: string;
    if (pct <= requiredFillPct) {
      label = `Protocol buffer: ${fmt(lockedBuffer)} USDC locked (${bufferPct}% of NAV)`;
    } else if (pct <= fillPct) {
      label = `Excess idle: ${fmt(Math.max(0, idleBalance - requiredBuffer))} USDC above required`;
    } else {
      label = `Deployed: ${fmt(Math.max(0, totalNAV - idleBalance))} USDC (${deployedPct.toFixed(1)}% of NAV)`;
    }
    setBarTooltip({ x, label });
  };

  return (
    <div className={`rounded-[18px] border ${health.border} ${health.bg} p-4 space-y-3`}>
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${health.text}`} />
          <p className="text-xs font-semibold text-ink-900">Liquidity Buffer</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${health.bg} ${health.text} ${health.border}`}>
          {healthLabel}
        </span>
      </div>

      {/* Buffer bar */}
      <div className="space-y-1.5">
        {/* Bar */}
        <div
          ref={barRef}
          className="relative h-4 rounded-full bg-slate-200/60 overflow-visible border border-slate-200/50 cursor-default"
          onMouseMove={handleBarMouseMove}
          onMouseLeave={() => setBarTooltip(null)}
        >
          {/* Inner clip container so segments stay rounded */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            {/* Deployed capital — fills from right */}
            <div
              className="absolute right-0 top-0 h-full bg-slate-300/60 transition-all"
              style={{ width: `${deployedPct}%` }}
            />

            {/* Excess idle — between locked threshold and total idle */}
            {fillPct > requiredFillPct && (
              <div
                className="absolute top-0 h-full bg-teal-300/70 transition-all"
                style={{ left: `${requiredFillPct}%`, width: `${fillPct - requiredFillPct}%` }}
              />
            )}

            {/* Locked protocol buffer */}
            <div
              className={`absolute left-0 top-0 h-full ${health.bar} opacity-80 transition-all`}
              style={{ width: `${Math.min(100, requiredFillPct)}%` }}
            />

            {/* Required threshold divider */}
            <div
              className="absolute top-0 h-full w-0.5 bg-white/80 pointer-events-none"
              style={{ left: `${Math.min(99.5, requiredFillPct)}%` }}
            />
          </div>

          {/* Floating tooltip */}
          {barTooltip && (
            <div
              className="absolute -top-9 z-50 pointer-events-none"
              style={{ left: Math.min(barTooltip.x, (barRef.current?.offsetWidth ?? 0) - 10) }}
            >
              <div className="relative -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-ink-900 text-white text-[10px] px-2.5 py-1.5 shadow-lg">
                {barTooltip.label}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-900" />
              </div>
            </div>
          )}
        </div>

        {/* Axis labels */}
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>0%</span>
          <span className={`font-semibold ${health.text}`}>
            Required {bufferPct}% ({fmt(requiredBuffer)} USDC)
          </span>
          <span>100%</span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${health.bar} opacity-80`} />
            <span className="text-[10px] text-slate-500">Protocol buffer (locked)</span>
          </div>
          {fillPct > requiredFillPct && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-300/70" />
              <span className="text-[10px] text-slate-500">Excess idle</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-300/60 border border-slate-300" />
            <span className="text-[10px] text-slate-500">Deployed capital</span>
          </div>
          <InlineTooltip content="Buffer coverage = actual idle ÷ required buffer × 100">
            <Info className="w-3 h-3 text-slate-400 cursor-default" />
            <span className="text-[10px] text-slate-400">Coverage:</span>
            <span className={`text-[10px] font-semibold ${health.text}`}>{bufferUtilization.toFixed(0)}%</span>
          </InlineTooltip>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/60 rounded-[10px] p-2.5 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Lock className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] text-slate-500">Locked Buffer</span>
          </div>
          <p className={`text-sm font-bold font-mono ${health.text}`}>{fmt(lockedBuffer)}</p>
          <p className="text-[9px] text-slate-400">USDC reserved</p>
        </div>

        {variant === 'admin' ? (
          <div className="bg-white/60 rounded-[10px] p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-teal-700" />
              <span className="text-[10px] text-slate-500">Max Deployable</span>
            </div>
            <p className="text-sm font-bold font-mono text-teal-700">{fmt(deployableBalance)}</p>
            <p className="text-[9px] text-slate-400">USDC available</p>
          </div>
        ) : (
          <div className="bg-white/60 rounded-[10px] p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <ShieldCheck className="w-3 h-3 text-success-700" />
              <span className="text-[10px] text-slate-500">Protocol Protected</span>
            </div>
            <p className="text-sm font-bold font-mono text-success-700">{fmt(lockedBuffer)}</p>
            <p className="text-[9px] text-slate-400">always accessible</p>
          </div>
        )}
      </div>

      {/* Warning when below 100% */}
      {bufferUtilization < 100 && (
        <div className="flex items-center gap-1.5 bg-error-100 border border-error-700/20 rounded-[8px] p-2">
          <AlertTriangle className="w-3 h-3 text-error-700 flex-shrink-0" />
          <p className="text-[10px] text-error-700">
            Buffer shortfall: {fmt(requiredBuffer - idleBalance)} USDC below protocol minimum
          </p>
        </div>
      )}

      {/* Client trust message */}
      {variant === 'client' && bufferUtilization >= 100 && (
        <p className="text-[10px] text-center text-slate-500 border-t border-white/40 pt-2">
          Your {bufferPct}% liquidity buffer is protocol-enforced and cannot be deployed by fund managers.
        </p>
      )}
    </div>
  );
}
