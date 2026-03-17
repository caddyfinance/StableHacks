interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const colorMap: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400',
  success: 'bg-green-900/40 text-green-400',
  approved: 'bg-green-900/40 text-green-400',
  compliant: 'bg-green-900/40 text-green-400',
  pending: 'bg-yellow-900/40 text-yellow-400',
  consent_required: 'bg-yellow-900/40 text-yellow-400',
  blocked: 'bg-red-900/40 text-red-400',
  failure: 'bg-red-900/40 text-red-400',
  revoked: 'bg-red-900/40 text-red-400',
  paused: 'bg-orange-900/40 text-orange-400',
  disabled: 'bg-gray-800 text-gray-400',
  none: 'bg-gray-800 text-gray-400',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const s = status || 'none';
  const color = colorMap[s.toLowerCase()] || 'bg-gray-800 text-gray-400';
  return (
    <span className={`inline-flex items-center rounded font-medium capitalize ${color} ${
      size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
    }`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}
