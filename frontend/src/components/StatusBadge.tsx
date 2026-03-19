interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const colorMap: Record<string, string> = {
  active: 'bg-success-100 text-success-700',
  success: 'bg-success-100 text-success-700',
  approved: 'bg-success-100 text-success-700',
  compliant: 'bg-success-100 text-success-700',
  completed: 'bg-success-100 text-success-700',
  settled: 'bg-success-100 text-success-700',
  pending: 'bg-warning-100 text-warning-700',
  consent_required: 'bg-warning-100 text-warning-700',
  cooldown: 'bg-warning-100 text-warning-700',
  blocked: 'bg-error-100 text-error-700',
  failure: 'bg-error-100 text-error-700',
  failed: 'bg-error-100 text-error-700',
  revoked: 'bg-error-100 text-error-700',
  rejected: 'bg-error-100 text-error-700',
  paused: 'bg-warning-100 text-warning-700',
  review: 'bg-review-100 text-review-700',
  escalated: 'bg-review-100 text-review-700',
  disabled: 'bg-slate-100 text-slate-500',
  none: 'bg-slate-100 text-slate-500',
  unwound: 'bg-info-100 text-info-700',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const s = status || 'none';
  const color = colorMap[s.toLowerCase()] || 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex items-center rounded-md font-medium capitalize ${color} ${
      size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
    }`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}
