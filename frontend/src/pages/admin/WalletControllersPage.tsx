import { useState, useEffect, useMemo } from 'react';
import { Plus, X, ExternalLink, Search } from 'lucide-react';
import { api } from '../../lib/api';

const typeColors: Record<string, string> = {
  BANK_TREASURY: 'bg-blue-100 text-blue-700 border-blue-300/40',
  CLIENT_ACCOUNT: 'bg-success-100 text-success-700 border-success-700/20',
  SEGREGATED_VAULT: 'bg-purple-100 text-purple-700 border-purple-300/40',
  PROVIDER_ADDRESS: 'bg-orange-100 text-orange-700 border-orange-300/40',
  REDEMPTION_WALLET: 'bg-teal-100 text-teal-700 border-teal-300/40',
  UNKNOWN: 'bg-slate-100 text-slate-600 border-slate-200',
};

const typeLabels: Record<string, string> = {
  BANK_TREASURY: 'Bank Treasury',
  CLIENT_ACCOUNT: 'Client Account',
  SEGREGATED_VAULT: 'Segregated Vault',
  PROVIDER_ADDRESS: 'Provider',
  REDEMPTION_WALLET: 'Redemption',
  UNKNOWN: 'Unknown',
};

const verificationColors: Record<string, string> = {
  VERIFIED: 'bg-success-100 text-success-700 border-success-700/20',
  PENDING: 'bg-warning-100 text-warning-700 border-warning-700/20',
  UNVERIFIED: 'bg-error-100 text-error-700 border-error-700/20',
};

export default function WalletControllersPage() {
  const [controllers, setControllers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.getWalletControllers();
      setControllers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const availableTypes = useMemo(() => {
    const types = new Set(controllers.map(c => c.controllerType));
    return Array.from(types).sort();
  }, [controllers]);

  const filtered = useMemo(() => {
    let result = controllers;
    if (filter) result = result.filter(c => c.controllerType === filter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.address.toLowerCase().includes(q) ||
        c.controllerName.toLowerCase().includes(q) ||
        c.permittedUse.toLowerCase().includes(q)
      );
    }
    return result;
  }, [controllers, filter, search]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    let verified = 0;
    controllers.forEach(c => {
      byType[c.controllerType] = (byType[c.controllerType] || 0) + 1;
      if (c.verificationStatus === 'VERIFIED') verified++;
    });
    return { total: controllers.length, verified, byType };
  }, [controllers]);

  if (loading) return <div className="p-6 text-slate-500">Loading wallet controllers...</div>;

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Wallet Controller Registry</h1>
          <p className="text-sm text-slate-500 mt-1">Every address mapped to its controller with full attribution.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Register Wallet
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Wallets" value={stats.total} />
        <StatCard label="Verified" value={stats.verified} color="text-success-700" />
        <StatCard label="Types" value={Object.keys(stats.byType).length} />
        <StatCard label="Unverified" value={stats.total - stats.verified} color={stats.total - stats.verified > 0 ? 'text-warning-700' : 'text-slate-500'} />
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address, controller, or use..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterChip label="All" count={controllers.length} active={!filter} onClick={() => setFilter('')} />
          {availableTypes.map((type) => (
            <FilterChip
              key={type}
              label={typeLabels[type] || type.replace(/_/g, ' ')}
              count={stats.byType[type] || 0}
              active={filter === type}
              onClick={() => setFilter(type)}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Address</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Controller</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Type</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Permitted Use</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Links</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <code className="text-[11px] text-ink-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                    {truncate(c.address)}
                  </code>
                  {c.vaultId && (
                    <span className="ml-2 text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                      {c.vaultId}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-ink-900">{c.controllerName}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium whitespace-nowrap ${typeColors[c.controllerType] || typeColors.UNKNOWN}`}>
                    {typeLabels[c.controllerType] || c.controllerType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[220px]">{c.permittedUse}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${verificationColors[c.verificationStatus] || verificationColors.UNVERIFIED}`}>
                    {c.verificationStatus}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {c.explorerLink && (
                      <a href={c.explorerLink} target="_blank" rel="noopener noreferrer" className="text-[10px] flex items-center gap-1 text-teal-700 hover:underline">
                        <ExternalLink className="w-3 h-3" /> Explorer
                      </a>
                    )}
                    {c.chainalysisLink && (
                      <a href={c.chainalysisLink} target="_blank" rel="noopener noreferrer" className="text-[10px] flex items-center gap-1 text-blue-600 hover:underline">
                        <ExternalLink className="w-3 h-3" /> KYT
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">
            {search || filter ? 'No wallets match the current filter.' : 'No wallet controllers registered.'}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Showing {filtered.length} of {controllers.length} registered wallets
      </p>

      {/* Add Wallet Modal */}
      {showAddModal && (
        <AddWalletModal
          onClose={() => setShowAddModal(false)}
          onCreated={(wallet) => {
            setControllers([wallet, ...controllers]);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddWalletModal({ onClose, onCreated }: { onClose: () => void; onCreated: (w: any) => void }) {
  const [form, setForm] = useState({
    address: '',
    controllerName: '',
    controllerType: 'CLIENT_ACCOUNT',
    permittedUse: '',
    verificationStatus: 'VERIFIED',
    explorerLink: '',
    vaultId: '',
    providerId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.address || !form.controllerName) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        explorerLink: form.explorerLink || `https://explorer.solana.com/address/${form.address}?cluster=devnet`,
        vaultId: form.vaultId || undefined,
        providerId: form.providerId || undefined,
      };
      const result = await api.createWalletController(payload);
      onCreated(result);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-[18px] border border-slate-200 shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Register Wallet</h2>
            <p className="text-xs text-slate-500 mt-0.5">Map an address to its controller</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-ink-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Wallet Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Solana address or bank account reference"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Controller Name</label>
            <input
              type="text"
              value={form.controllerName}
              onChange={(e) => setForm({ ...form, controllerName: e.target.value })}
              placeholder="e.g. Client INST-4096 Custody Account"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Controller Type</label>
            <select
              value={form.controllerType}
              onChange={(e) => setForm({ ...form, controllerType: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            >
              <option value="BANK_TREASURY">Bank Treasury</option>
              <option value="CLIENT_ACCOUNT">Client Account</option>
              <option value="SEGREGATED_VAULT">Segregated Vault</option>
              <option value="PROVIDER_ADDRESS">Provider Address</option>
              <option value="REDEMPTION_WALLET">Redemption Wallet</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Permitted Use</label>
            <input
              type="text"
              value={form.permittedUse}
              onChange={(e) => setForm({ ...form, permittedUse: e.target.value })}
              placeholder="e.g. Vault funding, deposits"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Verification Status</label>
            <div className="flex gap-2">
              {['VERIFIED', 'PENDING', 'UNVERIFIED'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, verificationStatus: s })}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    form.verificationStatus === s
                      ? verificationColors[s]
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Vault ID (optional)</label>
            <input
              type="text"
              value={form.vaultId}
              onChange={(e) => setForm({ ...form, vaultId: e.target.value })}
              placeholder="e.g. VLT-003"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !form.address || !form.controllerName || !form.permittedUse}
              className="flex-1 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {submitting ? 'Registering...' : 'Register Wallet'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-slate-200 text-sm text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-[14px] border border-slate-200 p-4 text-center">
      <p className={`text-xl font-bold ${color || 'text-ink-900'}`}>{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
        active
          ? 'bg-teal-100 text-teal-700 border-teal-300/40'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label} <span className="text-slate-400 ml-0.5">({count})</span>
    </button>
  );
}

function truncate(addr: string) {
  if (!addr) return '';
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
