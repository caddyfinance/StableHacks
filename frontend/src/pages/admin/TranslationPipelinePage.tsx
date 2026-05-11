import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import {
  ArrowRight, CheckCircle, Copy, Filter, GitBranch, PlayCircle,
  ShieldCheck, Send, ExternalLink, AlertCircle, Vault,
} from 'lucide-react';

const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const truncatePda = (pda: string) => {
  if (!pda || pda.length < 16) return pda;
  return `${pda.slice(0, 8)}...${pda.slice(-8)}`;
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).catch(() => {});
};

const openSolanaExplorer = (address: string) => {
  window.open(`https://explorer.solana.com/address/${address}?cluster=devnet`, '_blank');
};

export default function TranslationPipelinePage() {
  const { activeVaultId, setActiveVaultId, notify } = useStore();
  const [vaults, setVaults] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedInstruction, setSelectedInstruction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getVaults().then(setVaults).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const cfg = await api.tlGetConfig().catch(() => ({ totalInstructions: 0, connectedPrograms: {} }));
      setConfig(cfg);

      if (activeVaultId) {
        const hist = await api.tlGetHistory(activeVaultId).catch(() => ({ data: [] }));
        setHistory(Array.isArray(hist) ? hist : (hist?.data || []));
      }
    } catch {
      notify('error', 'Failed to load translation layer data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeVaultId]);

  const handleTestInstruction = async () => {
    if (!activeVaultId) {
      notify('error', 'Please select a vault first');
      return;
    }
    try {
      await api.tlSubmitInstruction({
        instructionType: 'DEPOSIT',
        vaultId: activeVaultId,
        amount: 1000,
        jurisdiction: 'CH',
        strategyId: 'test-strategy',
      });
      notify('success', 'Test instruction submitted');
      loadData();
    } catch {
      notify('error', 'Failed to submit test instruction');
    }
  };

  const handleExecuteCompliance = async (id: string) => {
    try {
      await api.tlExecuteCompliance(id);
      notify('success', 'Compliance check executed');
      loadData();
    } catch {
      notify('error', 'Failed to execute compliance check');
    }
  };

  const handleExecuteAction = async (id: string) => {
    try {
      await api.tlExecuteAction(id);
      notify('success', 'Action executed');
      loadData();
    } catch {
      notify('error', 'Failed to execute action');
    }
  };

  const pipelineSteps = [
    { label: 'Received', key: 'received', color: 'bg-teal-100 text-teal-700' },
    { label: 'Compliance Checked', key: 'compliance_checked', color: 'bg-teal-100 text-teal-700' },
    { label: 'Route Selected', key: 'route_selected', color: 'bg-teal-100 text-teal-700' },
    { label: 'Executed', key: 'executed', color: 'bg-success-100 text-success-700' },
    { label: 'Booked Back', key: 'booked_back', color: 'bg-success-100 text-success-700' },
    { label: 'Complete', key: 'complete', color: 'bg-success-100 text-success-700' },
  ];

  const getStepStatus = (instruction: any, stepKey: string) => {
    if (!instruction) return 'inactive';
    const status = instruction.pipelineStatus || 'received';
    const stepOrder = ['received', 'compliance_checked', 'route_selected', 'executed', 'booked_back', 'complete'];
    const currentIdx = stepOrder.indexOf(status);
    const stepIdx = stepOrder.indexOf(stepKey);
    if (stepIdx < currentIdx) return 'complete';
    if (stepIdx === currentIdx) return 'active';
    return 'inactive';
  };

  const recentInstruction = history.length > 0 ? history[0] : null;

  if (loading) {
    return <div className="p-8 text-slate-500">Loading translation layer pipeline...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Translation Layer Pipeline</h1>
          <p className="text-sm text-slate-700 mt-1">
            AMINA Layer 2 — Instruction routing and compliance orchestration
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Vault className="w-4 h-4 text-slate-400" />
          <select
            value={activeVaultId || ''}
            onChange={(e) => { setActiveVaultId(e.target.value); setSelectedInstruction(null); }}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white text-ink-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors min-w-[180px]"
          >
            <option value="">Select vault...</option>
            {vaults.map((v: any) => (
              <option key={v.vaultId} value={v.vaultId}>
                {v.vaultId} — {v.clientReference || v.credentialId?.slice(0, 12)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Config Summary Card */}
      <Card title="Config Summary" subtitle="Translation layer infrastructure status">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-teal-50 rounded-md p-3">
            <p className="text-xs text-slate-500">Total Instructions</p>
            <p className="text-2xl font-bold text-ink-900 font-mono mt-1">{config?.totalInstructions || 0}</p>
          </div>
          <div className="bg-slate-100 rounded-md p-3">
            <p className="text-xs text-slate-500">Finstar Program</p>
            <p className="text-sm text-ink-900 font-mono mt-1 truncate">{config?.connectedPrograms?.finstar || '—'}</p>
          </div>
          <div className="bg-slate-100 rounded-md p-3">
            <p className="text-xs text-slate-500">Notabene Program</p>
            <p className="text-sm text-ink-900 font-mono mt-1 truncate">{config?.connectedPrograms?.notabene || '—'}</p>
          </div>
          <div className="bg-slate-100 rounded-md p-3">
            <p className="text-xs text-slate-500">Mesh/Jurisdiction</p>
            <p className="text-sm text-ink-900 font-mono mt-1 truncate">{config?.connectedPrograms?.mesh || '—'}</p>
          </div>
        </div>
      </Card>

      {/* Active Pipeline Steps */}
      <Card title="Active Pipeline Steps" subtitle={recentInstruction ? `Latest instruction: ${recentInstruction.instructionId}` : 'No active instructions'}>
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          {pipelineSteps.map((step, idx) => {
            const stepStatus = getStepStatus(recentInstruction, step.key);
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div
                  className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    stepStatus === 'complete'
                      ? 'bg-success-100 text-success-700'
                      : stepStatus === 'active'
                      ? 'bg-teal-100 text-teal-700 ring-2 ring-teal-300'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {step.label}
                </div>
                {idx < pipelineSteps.length - 1 && (
                  <ArrowRight className={`w-4 h-4 ${stepStatus === 'complete' ? 'text-success-700' : 'text-slate-300'}`} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Instruction History Table */}
      {!activeVaultId ? (
        <Card title="Instruction History" subtitle="No vault selected">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Filter className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm text-slate-700 font-medium">Select a vault from the dropdown above</p>
            <p className="text-xs text-slate-500 mt-1">to view translation layer history</p>
          </div>
        </Card>
      ) : (
        <Card title="Instruction History" subtitle={`Translation layer events for vault: ${activeVaultId}`}>
          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No instructions yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left py-2 pr-3 font-semibold">Instruction ID</th>
                    <th className="text-left py-2 pr-3 font-semibold">Type</th>
                    <th className="text-left py-2 pr-3 font-semibold">Vault ID</th>
                    <th className="text-right py-2 pr-3 font-semibold">Amount</th>
                    <th className="text-left py-2 pr-3 font-semibold">Jurisdiction</th>
                    <th className="text-left py-2 pr-3 font-semibold">Status</th>
                    <th className="text-left py-2 font-semibold">Received At</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((inst: any) => (
                    <tr
                      key={inst.instructionId}
                      className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedInstruction(inst)}
                    >
                      <td className="py-2.5 pr-3 font-mono text-ink-900 text-[11px]">{truncatePda(inst.instructionId)}</td>
                      <td className="py-2.5 pr-3">
                        <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">
                          {inst.instructionType?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-ink-900 text-[11px]">{truncatePda(inst.vaultId)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-ink-900">{fmt(inst.amount)}</td>
                      <td className="py-2.5 pr-3 text-ink-900">{inst.jurisdiction || '—'}</td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={inst.status} />
                      </td>
                      <td className="py-2.5 text-slate-500 whitespace-nowrap">
                        {inst.receivedAt ? new Date(inst.receivedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Pipeline Detail Panel */}
      {selectedInstruction && (
        <Card title="Pipeline Detail Panel" subtitle={`Instruction: ${selectedInstruction.instructionId}`}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-100 rounded-md p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Compliance Attestation PDA</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-ink-900">{truncatePda(selectedInstruction.complianceAttestationPda || 'Not available')}</code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(selectedInstruction.complianceAttestationPda)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                    </button>
                    {selectedInstruction.complianceAttestationPda && (
                      <button
                        onClick={() => openSolanaExplorer(selectedInstruction.complianceAttestationPda)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="View in Solana Explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 rounded-md p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Travel Rule Check PDA</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-ink-900">{truncatePda(selectedInstruction.travelRuleCheckPda || 'Not available')}</code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(selectedInstruction.travelRuleCheckPda)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                    </button>
                    {selectedInstruction.travelRuleCheckPda && (
                      <button
                        onClick={() => openSolanaExplorer(selectedInstruction.travelRuleCheckPda)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="View in Solana Explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 rounded-md p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Routing Decision PDA</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-ink-900">{truncatePda(selectedInstruction.routingDecisionPda || 'Not available')}</code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(selectedInstruction.routingDecisionPda)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                    </button>
                    {selectedInstruction.routingDecisionPda && (
                      <button
                        onClick={() => openSolanaExplorer(selectedInstruction.routingDecisionPda)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="View in Solana Explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 rounded-md p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">GL Entry PDA (Finstar book-back)</p>
                <div className="flex items-center justify-between">
                  <code className="text-xs font-mono text-ink-900">{truncatePda(selectedInstruction.glEntryPda || 'Not available')}</code>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(selectedInstruction.glEntryPda)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                    </button>
                    {selectedInstruction.glEntryPda && (
                      <button
                        onClick={() => openSolanaExplorer(selectedInstruction.glEntryPda)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title="View in Solana Explorer"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedInstruction(null)}
              className="w-full py-2 text-xs text-slate-700 hover:text-ink-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Close Detail Panel
            </button>
          </div>
        </Card>
      )}

      {/* Quick Action Buttons */}
      <Card title="Quick Actions" subtitle="Pipeline testing and execution controls">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <button
            onClick={handleTestInstruction}
            disabled={!activeVaultId}
            className="flex items-center justify-center gap-2 bg-teal-50 border border-teal-700/20 rounded-md p-4 text-left hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Send className="w-4 h-4 text-teal-700" />
            <div>
              <p className="text-sm font-medium text-ink-900">Submit Test Instruction</p>
              <p className="text-[10px] text-slate-500">Send sample deposit instruction</p>
            </div>
          </button>

          <button
            onClick={() => selectedInstruction && handleExecuteCompliance(selectedInstruction.instructionId)}
            disabled={!selectedInstruction || selectedInstruction.status !== 'pending'}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-md p-4 text-left hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <div>
              <p className="text-sm font-medium text-ink-900">Execute Compliance</p>
              <p className="text-[10px] text-slate-500">Run compliance check on selected</p>
            </div>
          </button>

          <button
            onClick={() => selectedInstruction && handleExecuteAction(selectedInstruction.instructionId)}
            disabled={!selectedInstruction || selectedInstruction.status !== 'compliance_checked'}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-md p-4 text-left hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <PlayCircle className="w-4 h-4 text-teal-700" />
            <div>
              <p className="text-sm font-medium text-ink-900">Execute Action</p>
              <p className="text-[10px] text-slate-500">Execute compliance-checked instruction</p>
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
}
