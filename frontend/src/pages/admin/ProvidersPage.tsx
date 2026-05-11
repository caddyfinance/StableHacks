import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../../lib/api';

const statusColors: Record<string, string> = {
  APPROVED: 'bg-success-100 text-success-700 border-success-700/20',
  RESTRICTED: 'bg-warning-100 text-warning-700 border-warning-700/20',
  BLOCKED: 'bg-error-100 text-error-700 border-error-700/20',
  Clear: 'bg-success-100 text-success-700 border-success-700/20',
  Completed: 'bg-success-100 text-success-700 border-success-700/20',
  Available: 'bg-success-100 text-success-700 border-success-700/20',
  Current: 'bg-teal-100 text-teal-700 border-teal-300/40',
};

function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${color}`}>{status}</span>;
}

const PROVIDER_TYPES = [
  'Approved External Yield Provider',
  'Approved Lending Protocol',
  'Approved Staking Provider',
  'Approved Liquidity Pool',
  'Approved RWA Protocol',
];

const RISK_TIERS = ['conservative', 'balanced', 'growth', 'aggressive'];

export default function ProvidersPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadProviders = async () => {
    try {
      const data = await api.getProviders();
      setProviders(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProviders(); }, []);

  useEffect(() => {
    if (!selectedId) { setMonitoring(null); return; }
    api.getProviderMonitoring(selectedId).then(setMonitoring).catch(() => setMonitoring(null));
  }, [selectedId]);

  if (loading) return <div className="p-6 text-slate-500">Loading providers...</div>;

  const provider = providers.find(p => p.id === selectedId);

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Approved Yield Providers</h1>
          <p className="text-sm text-slate-500 mt-1">Bank-evaluated and approved DeFi providers. The vault enforces these approvals.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      {/* Provider List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`text-left p-4 rounded-[18px] border transition-all ${
              p.id === selectedId
                ? 'bg-teal-50 border-teal-300 shadow-1'
                : 'bg-white border-slate-200 hover:border-teal-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-ink-900">{p.providerName}</h3>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs text-slate-500">{p.strategy}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-slate-400">{p.providerType}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Exposure: {p.exposureLimit}%</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{p.mandateFit?.length || 0} tiers</span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Provider Detail */}
      {provider && (
        <>
          {/* Provider Header Card */}
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink-900">{provider.providerName}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{provider.strategy}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={provider.status} />
                <span className="text-xs text-slate-400">Last reviewed: {new Date(provider.lastReviewDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Bank Review & Compliance Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 p-5">
              <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Approval Profile</h3>
              <div className="space-y-3">
                <Row label="Provider" value={provider.providerName} />
                <Row label="Strategy" value={provider.strategy} />
                <Row label="Status" value={provider.status} badge />
                <Row label="Bank Review Status" value={provider.bankReviewStatus} badge />
                <Row label="Provider Type" value={provider.providerType} />
                <Row label="KYT Status" value={provider.kytStatus} badge />
                <Row label="OFAC / Sanctions Status" value={provider.ofacSanctionsStatus} badge />
                <Row label="Travel Rule Treatment" value={provider.travelRuleTreatment} />
                <Row label="Protocol Due Diligence" value={provider.protocolDueDiligence} badge />
                <Row label="Mandate Fit" value={provider.mandateFit?.join(', ') || 'N/A'} />
                <Row label="Exposure Limit" value={`Max ${provider.exposureLimit}% of vault NAV`} />
                <Row label="Last Review" value={new Date(provider.lastReviewDate).toLocaleDateString()} />
                <Row label="Next Review" value={new Date(provider.nextReviewDate).toLocaleDateString()} />
              </div>
            </div>

            <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 p-5">
              <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Compliance Profile</h3>
              <div className="space-y-3">
                <Row label="Provider Review" value={provider.protocolDueDiligence} badge />
                <Row label="Jurisdiction Treatment" value={provider.jurisdictionTreatment} />
                <Row label="Client Eligibility" value={provider.clientEligibility} />
                <Row label="Vault Eligibility" value={provider.vaultEligibility?.join(' / ') || 'All'} />
                <Row label="Max Allocation" value={`${provider.exposureLimit}%`} />
                <Row label="Destination Wallet" value={provider.destinationWallet} badge />
                <Row label="KYT Screening" value={provider.kytScreeningRequired ? 'Required' : 'Not Required'} badge={provider.kytScreeningRequired} />
                <Row label="OFAC Screening" value={provider.ofacScreeningRequired ? 'Required' : 'Not Required'} badge={provider.ofacScreeningRequired} />
                <Row label="Travel Rule Check" value={provider.travelRuleRequired ? 'Required where transfer edge applies' : 'Not Required'} />
                <Row label="Review Notes" value={provider.reviewNotes || 'None'} />
              </div>
            </div>
          </div>

          {/* Monitoring Snapshot */}
          {monitoring && (
            <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 p-5">
              <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Provider Monitoring Snapshot</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MonitoringItem label="Bank Approval" value={monitoring.bankApprovalStatus} />
                <MonitoringItem label="Strategy Status" value={monitoring.strategyStatus} />
                <MonitoringItem label="Contract Monitoring" value={monitoring.contractMonitoring} />
                <MonitoringItem label="KYT Exposure" value={monitoring.kytExposure} />
                <MonitoringItem label="OFAC Status" value={monitoring.ofacStatus} />
                <MonitoringItem label="Liquidity Status" value={monitoring.liquidityStatus} />
                <MonitoringItem label="Review Status" value={monitoring.reviewStatus} />
                <MonitoringItem label="Last Reviewed" value={new Date(monitoring.lastReviewed).toLocaleDateString()} isDate />
              </div>
              <div className="flex gap-3 mt-5">
                <button className="text-xs px-3 py-1.5 rounded-md bg-teal-100 text-teal-700 border border-teal-300/40 font-medium hover:bg-teal-200 transition-colors">
                  View Provider Diligence Pack
                </button>
                <button className="text-xs px-3 py-1.5 rounded-md bg-warning-100 text-warning-700 border border-warning-700/20 font-medium hover:bg-warning-200 transition-colors">
                  Restrict
                </button>
                <button className="text-xs px-3 py-1.5 rounded-md bg-error-100 text-error-700 border border-error-700/20 font-medium hover:bg-error-200 transition-colors">
                  Revoke Approval
                </button>
              </div>
            </div>
          )}

          {/* Linked Strategies */}
          {provider.strategies?.length > 0 && (
            <div className="bg-white rounded-[18px] border border-slate-200 shadow-1 p-5">
              <h3 className="text-sm font-semibold text-ink-900 uppercase tracking-wider mb-4">Linked Strategies</h3>
              <div className="space-y-2">
                {provider.strategies.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-ink-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{s.currentYield}% APY</span>
                      <StatusBadge status={s.active ? 'Available' : 'Disabled'} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!provider && providers.length === 0 && (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm">No providers configured. Add your first DeFi provider.</p>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddModal && (
        <AddProviderModal
          onClose={() => setShowAddModal(false)}
          onCreated={(newProvider) => {
            setProviders([newProvider, ...providers]);
            setSelectedId(newProvider.id);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddProviderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: any) => void }) {
  const [form, setForm] = useState({
    providerName: '',
    strategy: '',
    providerType: PROVIDER_TYPES[0],
    status: 'APPROVED',
    exposureLimit: 50,
    mandateFit: ['conservative', 'balanced'] as string[],
    jurisdictionTreatment: 'Bank-reviewed',
    clientEligibility: 'Institutional only',
    kytStatus: 'Clear',
    ofacSanctionsStatus: 'Clear',
    reviewNotes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.providerName || !form.strategy) return;
    setSubmitting(true);
    try {
      const result = await api.createProvider(form);
      onCreated(result);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTier = (tier: string) => {
    setForm(f => ({
      ...f,
      mandateFit: f.mandateFit.includes(tier)
        ? f.mandateFit.filter(t => t !== tier)
        : [...f.mandateFit, tier],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-[18px] border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Add New DeFi Provider</h2>
            <p className="text-xs text-slate-500 mt-0.5">Register a bank-evaluated yield provider</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-ink-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Provider Name */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Provider Name</label>
            <input
              type="text"
              value={form.providerName}
              onChange={(e) => setForm({ ...form, providerName: e.target.value })}
              placeholder="e.g. Marinade Finance, Jito, Kamino..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              required
            />
          </div>

          {/* Strategy */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Strategy / Product</label>
            <input
              type="text"
              value={form.strategy}
              onChange={(e) => setForm({ ...form, strategy: e.target.value })}
              placeholder="e.g. SOL Liquid Staking, USDC Lending Pool..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              required
            />
          </div>

          {/* Provider Type */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Provider Type</label>
            <select
              value={form.providerType}
              onChange={(e) => setForm({ ...form, providerType: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            >
              {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Approval Status</label>
            <div className="flex gap-2">
              {['APPROVED', 'RESTRICTED', 'BLOCKED'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    form.status === s
                      ? statusColors[s]
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Exposure Limit */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">
              Exposure Limit (% of vault NAV): {form.exposureLimit}%
            </label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={form.exposureLimit}
              onChange={(e) => setForm({ ...form, exposureLimit: Number(e.target.value) })}
              className="w-full accent-teal-700"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>5%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Mandate Fit Tiers */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Mandate Fit (eligible risk tiers)</label>
            <div className="flex gap-2 flex-wrap">
              {RISK_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium capitalize transition-colors ${
                    form.mandateFit.includes(tier)
                      ? 'bg-teal-100 text-teal-700 border-teal-300/40'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          {/* Compliance Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-900 block mb-1.5">KYT Status</label>
              <select
                value={form.kytStatus}
                onChange={(e) => setForm({ ...form, kytStatus: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="Clear">Clear</option>
                <option value="Pending">Pending</option>
                <option value="Flagged">Flagged</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-900 block mb-1.5">OFAC Status</label>
              <select
                value={form.ofacSanctionsStatus}
                onChange={(e) => setForm({ ...form, ofacSanctionsStatus: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="Clear">Clear</option>
                <option value="Pending">Pending</option>
                <option value="Flagged">Flagged</option>
              </select>
            </div>
          </div>

          {/* Review Notes */}
          <div>
            <label className="text-xs font-medium text-ink-900 block mb-1.5">Review Notes (optional)</label>
            <textarea
              value={form.reviewNotes}
              onChange={(e) => setForm({ ...form, reviewNotes: e.target.value })}
              placeholder="Any notes from the bank's due diligence review..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !form.providerName || !form.strategy}
              className="flex-1 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {submitting ? 'Creating...' : 'Approve & Register Provider'}
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

function Row({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      {badge ? <StatusBadge status={value} /> : <span className="text-xs text-ink-900 font-medium text-right break-words">{value}</span>}
    </div>
  );
}

function MonitoringItem({ label, value, isDate }: { label: string; value: string; isDate?: boolean }) {
  const isGood = ['Approved', 'Available', 'Clear', 'Current', 'No new critical event', 'Within approved range'].includes(value);
  return (
    <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className={`w-2 h-2 rounded-full mx-auto mb-2 ${isDate ? 'bg-slate-400' : isGood ? 'bg-success-700' : 'bg-warning-700'}`} />
      <p className="text-xs font-medium text-ink-900">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
