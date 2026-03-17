import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore, ROLE_LABELS } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import { Shield, Building2, TrendingUp, ClipboardCheck, ArrowRight } from 'lucide-react';

export default function AdminDashboardPage() {
  const { currentRole, activeVaultId, setActiveVaultId, notify } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ credentials: 0, vaults: 0, events: 0, strategies: 0 });
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [creds, vaultList, events, strats] = await Promise.all([
          api.getCredentials(),
          api.getVaults(),
          api.getEvents(),
          api.getStrategies(),
        ]);
        setStats({
          credentials: creds.length,
          vaults: vaultList.filter((v: any) => v.status === 'active').length,
          events: events.length,
          strategies: strats.filter((s: any) => !s.disabled).length,
        });
        setVaults(vaultList);
        if (!activeVaultId && vaultList.length > 0) {
          setActiveVaultId(vaultList[0].vaultId);
        }
      } catch {
        notify('error', 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Credentials Issued', value: stats.credentials, icon: Shield, color: 'text-blue-400' },
    { label: 'Active Vaults', value: stats.vaults, icon: Building2, color: 'text-green-400' },
    { label: 'Compliance Events', value: stats.events, icon: ClipboardCheck, color: 'text-yellow-400' },
    { label: 'Active Strategies', value: stats.strategies, icon: TrendingUp, color: 'text-purple-400' },
  ];

  const demoSteps = [
    { step: 1, title: 'Issue Credential', desc: 'Approve institutional client with SAS-compatible credential', path: '/amina/credentials', role: 'admin' },
    { step: 2, title: 'Create Vault', desc: 'Deploy segregated, non-pooled vault per client', path: '/amina/vault-factory', role: 'admin' },
    { step: 3, title: 'Bind Mandate', desc: 'Attach strategy limits, destination controls, consent thresholds', path: '/amina/mandate', role: 'admin' },
    { step: 4, title: 'Fund Vault', desc: 'Deposit from approved source with provenance tracking', path: '/amina/funding', role: 'admin' },
    { step: 5, title: 'Block Bad Action', desc: 'Attempt allocation to blocked strategy — rejected by mandate', path: '/amina/execution', role: 'portfolio_manager' },
    { step: 6, title: 'Execute Strategy', desc: 'Allocate to approved strategy within policy limits', path: '/amina/execution', role: 'portfolio_manager' },
    { step: 7, title: 'Compliance Trail', desc: 'View full audit log and vault state snapshot', path: '/amina/compliance', role: 'compliance_officer' },
    { step: 8, title: 'Consent Gate', desc: 'Large action triggers client consent requirement', path: '/amina/execution', role: 'portfolio_manager' },
    { step: 9, title: 'Redemption', desc: 'Client redeems to approved destination', path: '/amina/compliance', role: 'admin' },
  ];

  if (loading) {
    return <div className="p-8 text-vault-muted">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Administration Dashboard</h1>
        <p className="text-sm text-vault-muted mt-1">
          Logged in as <span className="text-vault-accent font-medium">{ROLE_LABELS[currentRole]}</span>
          {activeVaultId && <span> — Active vault: <span className="text-white font-mono">{activeVaultId}</span></span>}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-vault-card border border-vault-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <Icon size={20} className={color} />
              <span className="text-2xl font-bold text-white">{value}</span>
            </div>
            <p className="text-xs text-vault-muted mt-2">{label}</p>
          </div>
        ))}
      </div>

      {/* Active Vault */}
      {vaults.length > 0 && (
        <Card title="Active Vault" subtitle={activeVaultId || 'None selected'}>
          <div className="grid grid-cols-4 gap-4">
            {vaults.slice(0, 1).map((v: any) => (
              <div key={v.vaultId} className="col-span-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-mono text-white">{v.vaultId}</p>
                    <p className="text-xs text-vault-muted">{v.clientReference} — {v.baseAsset}</p>
                  </div>
                  <StatusBadge status={v.status} />
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded font-medium">Segregated</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded font-medium">Non-Pooled</span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{v.totalNAV?.toLocaleString() || '0'} {v.baseAsset}</p>
                  <p className="text-xs text-vault-muted">Total NAV</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Demo Walkthrough */}
      <Card title="Demo Walkthrough" subtitle="Follow these steps to demonstrate the full institutional control flow">
        <div className="space-y-2">
          {demoSteps.map(({ step, title, desc, path, role }) => (
            <div
              key={step}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-vault-bg/50 transition-colors cursor-pointer group"
              onClick={() => navigate(path)}
            >
              <div className="w-7 h-7 rounded-full bg-vault-accent/20 text-vault-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
                {step}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-vault-muted">{desc}</p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 bg-vault-bg text-vault-muted rounded">{ROLE_LABELS[role as keyof typeof ROLE_LABELS]}</span>
              <ArrowRight size={14} className="text-vault-muted group-hover:text-vault-accent transition-colors" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
