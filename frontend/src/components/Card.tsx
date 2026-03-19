import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, children, className = '' }: Props) {
  return (
    <div className={`bg-white border border-slate-200 rounded-[18px] shadow-1 ${className}`}>
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-700 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
