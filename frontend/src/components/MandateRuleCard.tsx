import { Shield, BarChart2, CheckCircle, Bell, Ban, Wallet } from 'lucide-react';
import StatusBadge from './StatusBadge';

const fmt = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type RuleType =
  | 'liquidity_buffer'
  | 'strategy_cap'
  | 'strategy_allowlist'
  | 'consent_threshold'
  | 'leverage_banned'
  | 'leverage_allowed'
  | 'approved_destination';

interface MandateRuleCardProps {
  ruleType: RuleType | string;
  params: Record<string, any>;
  status?: 'active' | 'superseded' | 'removed' | string;
  version?: number;
  /** If provided, amounts are displayed as "X USDC locked" etc. */
  navContext?: number;
}

function getRuleConfig(ruleType: string, params: Record<string, any>, navContext?: number) {
  switch (ruleType) {
    case 'liquidity_buffer': {
      const bps: number = params.bps ?? 1000;
      const pct = bps / 100;
      const locked = navContext != null ? (navContext * bps) / 10000 : null;
      return {
        Icon: Shield,
        iconColor: 'text-teal-700',
        iconBg: 'bg-teal-100',
        title: 'Liquidity Buffer',
        description: locked != null
          ? `${pct}% of NAV must remain idle — currently locks ${fmt(locked)} USDC`
          : `${pct}% of total NAV must remain idle at all times`,
        badge: `${pct}%`,
        badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      };
    }
    case 'strategy_cap': {
      const maxPct = (params.maxBps ?? 0) / 100;
      return {
        Icon: BarChart2,
        iconColor: 'text-ink-700',
        iconBg: 'bg-slate-100',
        title: 'Strategy Cap',
        description: `Max ${maxPct}% of NAV into ${params.strategyId ?? 'strategy'}`,
        badge: `${maxPct}%`,
        badgeColor: 'bg-slate-100 text-ink-700 border-slate-200',
      };
    }
    case 'strategy_allowlist': {
      const count = (params.strategies ?? []).length;
      return {
        Icon: CheckCircle,
        iconColor: 'text-success-700',
        iconBg: 'bg-success-100',
        title: 'Strategy Allowlist',
        description: count > 0
          ? `${count} strateg${count === 1 ? 'y' : 'ies'} permitted`
          : 'No strategies explicitly permitted',
        badge: `${count} allowed`,
        badgeColor: 'bg-success-100 text-success-700 border-success-700/20',
      };
    }
    case 'consent_threshold': {
      const amount: number = params.amount ?? 0;
      return {
        Icon: Bell,
        iconColor: 'text-warning-700',
        iconBg: 'bg-warning-100',
        title: 'Consent Threshold',
        description: `Admin actions ≥ ${amount.toLocaleString()} USDC require client approval`,
        badge: `${amount.toLocaleString()} USDC`,
        badgeColor: 'bg-warning-100 text-warning-700 border-warning-700/20',
      };
    }
    case 'leverage_banned':
      return {
        Icon: Ban,
        iconColor: 'text-error-700',
        iconBg: 'bg-error-100',
        title: 'Leverage Restriction',
        description: 'No leveraged positions permitted',
        badge: 'Banned',
        badgeColor: 'bg-error-100 text-error-700 border-error-700/20',
      };
    case 'leverage_allowed':
      return {
        Icon: BarChart2,
        iconColor: 'text-ink-700',
        iconBg: 'bg-slate-100',
        title: 'Leverage',
        description: 'Leveraged positions are permitted',
        badge: 'Allowed',
        badgeColor: 'bg-slate-100 text-ink-700 border-slate-200',
      };
    case 'approved_destination': {
      const count = (params.wallets ?? []).length;
      return {
        Icon: Wallet,
        iconColor: 'text-teal-700',
        iconBg: 'bg-teal-100',
        title: 'Approved Destinations',
        description: count > 0
          ? `${count} wallet${count === 1 ? '' : 's'} authorized for withdrawals`
          : 'No destination restrictions',
        badge: `${count} wallet${count === 1 ? '' : 's'}`,
        badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      };
    }
    default:
      return {
        Icon: Shield,
        iconColor: 'text-slate-500',
        iconBg: 'bg-slate-100',
        title: ruleType.replace(/_/g, ' '),
        description: JSON.stringify(params),
        badge: 'Custom',
        badgeColor: 'bg-slate-100 text-slate-500 border-slate-200',
      };
  }
}

export default function MandateRuleCard({
  ruleType,
  params,
  status = 'active',
  version,
  navContext,
}: MandateRuleCardProps) {
  const config = getRuleConfig(ruleType, params, navContext);
  const { Icon, iconColor, iconBg, title, description, badge, badgeColor } = config;

  const isSuperseded = status === 'superseded' || status === 'removed';

  return (
    <div className={`flex items-center gap-3 bg-slate-100 rounded-[12px] px-4 py-3 ${isSuperseded ? 'opacity-50' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-ink-900">{title}</p>
          {version != null && (
            <span className="text-[9px] font-mono text-slate-400">v{version}</span>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${badgeColor}`}>
          {badge}
        </span>
        {isSuperseded ? (
          <StatusBadge status="inactive" size="sm" />
        ) : (
          <StatusBadge status="active" size="sm" />
        )}
      </div>
    </div>
  );
}
