import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Card from '../../components/Card';
import {
  Layers, ArrowDown, ArrowRight, CheckCircle, Building2, Shield, TrendingUp,
  Activity, DollarSign, FileText, Globe, Lock, Zap, Server,
  Database, GitBranch, Wallet, Landmark,
  ArrowDownToLine, ArrowUpFromLine, PlayCircle,
  ChevronRight, CircleDot,
} from 'lucide-react';

const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface LayerStats {
  vaultCount: number;
  totalAUM: number;
  strategiesCount: number;
  tlInstructionsProcessed: number;
  tlPipelineCompletions: number;
  finstarGLEntries: number;
  finstarTotalCredits: number;
  finstarTotalDebits: number;
  complianceChecks: number;
  travelRuleChecks: number;
}

type ActionType = 'Deposit' | 'Allocate' | 'Redeem' | 'Unwind' | 'Pause' | 'MandateUpdate';

interface ActionFlowStep {
  layer: 'layer3' | 'layer2' | 'layer1';
  label: string;
  detail: string;
  module?: string;
  glEntryType?: string;
}

const ACTION_FLOWS: Record<ActionType, { description: string; steps: ActionFlowStep[] }> = {
  Deposit: {
    description: 'Client deposits USDC into a segregated vault with provenance tracking',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Verify SAS credential, validate mandate buffer, credit idle balance', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit deposit instruction to translation layer pipeline' },
      { layer: 'layer2', label: 'Jurisdiction Check', detail: 'Jurisdiction engine validates client jurisdiction (CH, AE, HK, SG)' },
      { layer: 'layer2', label: 'Travel Rule', detail: 'Notabene performs Travel Rule / VASP counterparty screening' },
      { layer: 'layer2', label: 'Venue Routing', detail: 'Mesh routes deposit to appropriate on-chain venue' },
      { layer: 'layer2', label: 'Execute & Book-Back', detail: 'Execute on-chain deposit, trigger Finstar book-back' },
      { layer: 'layer1', label: 'Finstar GL Entry', detail: 'Debit: Client bank account → Credit: Vault custody account (Deposit)', glEntryType: 'Deposit' },
    ],
  },
  Allocate: {
    description: 'Portfolio manager deploys idle capital into yield strategies per mandate limits',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Check mandate allocation limits, validate strategy eligibility, enforce 10% buffer', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit allocation instruction to translation layer' },
      { layer: 'layer2', label: 'Compliance Check', detail: 'Jurisdiction + Travel Rule + mandate rule validation' },
      { layer: 'layer2', label: 'Route & Execute', detail: 'Mesh routes to strategy venue (e.g. Solstice), execute on-chain' },
      { layer: 'layer1', label: 'Finstar GL Entry', detail: 'Debit: Vault idle account → Credit: Strategy allocation account (StrategyAllocation)', glEntryType: 'StrategyAllocation' },
    ],
  },
  Redeem: {
    description: 'Client redeems from vault idle balance, protected by liquidity buffer',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Validate redemption against 10% minimum liquidity buffer, check idle balance', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit redemption instruction to translation layer' },
      { layer: 'layer2', label: 'Compliance Check', detail: 'Jurisdiction validation + Travel Rule screening for outgoing funds' },
      { layer: 'layer2', label: 'Route & Execute', detail: 'Execute on-chain transfer, initiate book-back to bank' },
      { layer: 'layer1', label: 'Finstar GL Entry', detail: 'Debit: Vault custody account → Credit: Client bank account (Withdrawal)', glEntryType: 'Withdrawal' },
    ],
  },
  Unwind: {
    description: 'Strategy position unwound — funds return to vault idle balance',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Initiate strategy unwind, calculate accrued yield, return to idle', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit unwind instruction to translation layer' },
      { layer: 'layer2', label: 'Compliance Check', detail: 'Verify unwind compliance, validate return path' },
      { layer: 'layer2', label: 'Route & Execute', detail: 'Execute unwind on strategy venue (e.g. Solstice unlock)' },
      { layer: 'layer1', label: 'Finstar GL Entry', detail: 'Debit: Strategy account → Credit: Vault idle account (StrategyUnwind)', glEntryType: 'StrategyUnwind' },
    ],
  },
  Pause: {
    description: 'Emergency admin pauses vault — all deposits, allocations blocked immediately',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Toggle vault pause flag — blocks all deposit, allocate, redeem operations', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit pause instruction to translation layer' },
      { layer: 'layer2', label: 'Compliance Check', detail: 'Verify emergency admin authorization, validate role permissions' },
      { layer: 'layer2', label: 'Route & Execute', detail: 'Execute on-chain pause CPI, emit emergency event' },
      { layer: 'layer1', label: 'Operational Flag', detail: 'No GL entry — operational control flag for regulatory reporting' },
    ],
  },
  MandateUpdate: {
    description: 'Admin updates mandate policy — allocation limits, buffer requirements, strategy rules',
    steps: [
      { layer: 'layer3', label: 'Caddy Yield Module', detail: 'Update mandate policy: max allocation %, min buffer, allowed strategies', module: 'caddy' },
      { layer: 'layer2', label: 'Instruction Received', detail: 'Submit mandate update instruction to translation layer' },
      { layer: 'layer2', label: 'Compliance Check', detail: 'Validate mandate parameters against jurisdiction rules' },
      { layer: 'layer2', label: 'Route & Execute', detail: 'Execute on-chain mandate attach/update instruction' },
      { layer: 'layer1', label: 'Configuration Record', detail: 'No GL entry — mandate configuration stored on-chain for audit trail' },
    ],
  },
};

const MODULE_DETAILS: Record<string, {
  description: string;
  actions: ActionType[];
  dependencies: string[];
  partners: string[];
}> = {
  caddy: {
    description: 'Institutional yield vault module — segregated, non-pooled vaults with mandate-governed capital deployment',
    actions: ['Deposit', 'Allocate', 'Redeem', 'Unwind', 'Pause', 'MandateUpdate'],
    dependencies: ['Translation Layer (L2)', 'Finstar Core Banking (L1)', 'Notabene (Travel Rule)', 'Mesh (Venue Routing)', 'Jurisdiction Engine'],
    partners: ['Solstice', 'SAS'],
  },
  rewards: {
    description: 'AMINA retail reward accrual engine — handles loyalty points and reward distribution for individual clients',
    actions: [],
    dependencies: ['Translation Layer (L2)', 'Finstar Core Banking (L1)'],
    partners: [],
  },
  custody: {
    description: 'Off-exchange custody — trading collateral management with venue isolation and bankruptcy-remote structures',
    actions: [],
    dependencies: ['Translation Layer (L2)', 'Finstar Core Banking (L1)', 'Mesh (Venue Routing)'],
    partners: ['Mesh'],
  },
  lending: {
    description: 'Lombard lending — secured crypto-backed lending with automated collateral management and margin calls',
    actions: [],
    dependencies: ['Translation Layer (L2)', 'Finstar Core Banking (L1)'],
    partners: [],
  },
};

export default function ArchitecturePage() {
  const [expandedLayer, setExpandedLayer] = useState<string | null>('layer3');
  const [selectedModule, setSelectedModule] = useState<string | null>('caddy');
  const [selectedAction, setSelectedAction] = useState<ActionType | null>('Deposit');
  const [activeFlowStep, setActiveFlowStep] = useState<number>(0);
  const [stats, setStats] = useState<LayerStats>({
    vaultCount: 0, totalAUM: 0, strategiesCount: 0,
    tlInstructionsProcessed: 0, tlPipelineCompletions: 0, finstarGLEntries: 0,
    finstarTotalCredits: 0, finstarTotalDebits: 0, complianceChecks: 0, travelRuleChecks: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const [vaults, strategies, tlConfig, finstarConfig] = await Promise.all([
          api.getVaults().catch(() => []),
          api.getStrategies().catch(() => []),
          api.tlGetConfig().catch(() => null),
          api.finstarGetConfig().catch(() => null),
        ]);

        const totalAUM = vaults.reduce((sum: number, v: any) => sum + (v.totalNAV || 0), 0);

        setStats({
          vaultCount: vaults.length,
          totalAUM,
          strategiesCount: strategies.length,
          tlInstructionsProcessed: tlConfig?.totalInstructions || 0,
          tlPipelineCompletions: tlConfig?.completedPipelines || 0,
          finstarGLEntries: finstarConfig?.totalEntries || finstarConfig?.totalGLEntries || 0,
          finstarTotalCredits: finstarConfig?.totalCredits || 0,
          finstarTotalDebits: finstarConfig?.totalDebits || 0,
          complianceChecks: tlConfig?.totalComplianceChecks || 0,
          travelRuleChecks: tlConfig?.totalTravelRuleChecks || 0,
        });
      } catch {
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  useEffect(() => {
    if (!selectedAction) return;
    setActiveFlowStep(0);
    const interval = setInterval(() => {
      setActiveFlowStep(prev => {
        const flow = ACTION_FLOWS[selectedAction!];
        if (!flow) return 0;
        return prev >= flow.steps.length - 1 ? 0 : prev + 1;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedAction]);

  const toggleLayer = (layer: string) => {
    setExpandedLayer(expandedLayer === layer ? null : layer);
  };

  const currentFlow = selectedAction ? ACTION_FLOWS[selectedAction] : null;
  const currentModuleDetails = selectedModule ? MODULE_DETAILS[selectedModule] : null;

  const layers = [
    {
      id: 'layer3',
      name: 'Layer 3 \u2014 Crypto Services',
      badgeLabel: 'Caddy Module',
      badgeColor: 'bg-teal-100 text-teal-700',
      accentColor: 'border-teal-700',
      bgColor: 'bg-teal-50',
      modules: [
        { id: 'caddy', name: 'Caddy Yield Module', highlighted: true, icon: TrendingUp },
        { id: 'rewards', name: 'AMINA Rewards Engine', highlighted: false, icon: Zap },
        { id: 'custody', name: 'Off-Exchange Custody', highlighted: false, icon: Shield },
        { id: 'lending', name: 'Lombard Lending', highlighted: false, icon: Landmark },
      ],
      liveStats: [
        { label: 'Vaults', value: stats.vaultCount, icon: Wallet },
        { label: 'Total AUM', value: `$${fmt(stats.totalAUM)}`, icon: DollarSign },
        { label: 'Active Strategies', value: stats.strategiesCount, icon: Activity },
      ],
      namedPartners: ['Solstice', 'SAS'],
    },
    {
      id: 'layer2',
      name: 'Layer 2 \u2014 Translation Layer',
      badgeLabel: 'AMINA Proprietary IP',
      badgeColor: 'bg-amber-100 text-amber-700',
      accentColor: 'border-amber-700',
      bgColor: 'bg-amber-50',
      pipeline: [
        { label: 'Instruction', key: 'received', icon: FileText },
        { label: 'Jurisdiction Check', key: 'jurisdiction', icon: Shield },
        { label: 'Travel Rule', key: 'travel_rule', icon: Globe },
        { label: 'Venue Routing', key: 'venue_routing', icon: GitBranch },
        { label: 'Execute', key: 'execute', icon: PlayCircle },
        { label: 'Book-Back', key: 'book_back', icon: CheckCircle },
      ],
      connectedPrograms: [
        { name: 'Translation Layer', role: 'Pipeline Orchestrator', color: 'bg-amber-100 text-amber-700' },
        { name: 'Notabene', role: 'Travel Rule / VASP', color: 'bg-blue-100 text-blue-700' },
        { name: 'Mesh', role: 'Venue Routing', color: 'bg-purple-100 text-purple-700' },
        { name: 'Jurisdiction Engine', role: 'Compliance Attestation', color: 'bg-rose-100 text-rose-700' },
        { name: 'Amina Vault', role: 'Vault Operations (CPI)', color: 'bg-teal-100 text-teal-700' },
        { name: 'Finstar', role: 'Core Banking (CPI)', color: 'bg-slate-100 text-slate-700' },
      ],
      liveStats: [
        { label: 'Instructions Processed', value: stats.tlInstructionsProcessed, icon: FileText },
        { label: 'Pipeline Completions', value: stats.tlPipelineCompletions, icon: CheckCircle },
      ],
      namedIntegrations: ['Notabene', 'Mesh', 'SAS'],
    },
    {
      id: 'layer1',
      name: 'Layer 1 \u2014 Core Banking',
      badgeLabel: 'Finstar (via HBL ASP/BSP)',
      badgeColor: 'bg-slate-100 text-slate-700',
      accentColor: 'border-slate-700',
      bgColor: 'bg-slate-50',
      components: [
        { name: 'General Ledger', desc: 'Double-entry bookkeeping for all capital movements', types: ['Deposit', 'Withdrawal', 'YieldAccrual', 'FeeDebit', 'StrategyAllocation', 'StrategyUnwind', 'Transfer'] },
        { name: 'SWIFT Payments', desc: 'Cross-border payment references for fiat on/off-ramp', types: [] },
        { name: 'Regulatory Reporting', desc: 'Jurisdiction-specific reports (CH, AE, HK, SG)', types: [] },
        { name: 'Client Accounts', desc: 'Bank account management with provenance tracking', types: [] },
      ],
      liveStats: [
        { label: 'Total GL Entries', value: stats.finstarGLEntries, icon: Database },
        { label: 'Total Credits', value: `$${fmt(stats.finstarTotalCredits)}`, icon: ArrowDownToLine },
        { label: 'Total Debits', value: `$${fmt(stats.finstarTotalDebits)}`, icon: ArrowUpFromLine },
      ],
      namedPartners: ['Finstar', 'HBL'],
    },
  ];

  const clientSegments = [
    { segment: 'Individuals (professional investors)', fit: 'Yield module via mobile/web' },
    { segment: 'Corporates', fit: 'Payments-ops via APIs into treasury tooling' },
    { segment: 'Banks and fintechs (B2B2C)', fit: 'White-label for AMINA\'s B2B2C partners' },
  ];

  const namedPartners = [
    { name: 'Finstar', icon: Building2 },
    { name: 'HBL', icon: Building2 },
    { name: 'Notabene', icon: Shield },
    { name: 'Mesh', icon: Globe },
    { name: 'Metagon', icon: Server },
    { name: 'ebankit', icon: Database },
    { name: 'Solstice', icon: TrendingUp },
  ];

  const isStepInFlow = (layerId: string, stepKey: string) => {
    if (!currentFlow || !selectedAction) return false;
    const activeStep = currentFlow.steps[activeFlowStep];
    if (!activeStep) return false;
    if (activeStep.layer !== layerId) return false;
    const keyMap: Record<string, string[]> = {
      received: ['received'],
      jurisdiction: ['jurisdiction', 'compliance'],
      travel_rule: ['travel_rule', 'travel'],
      venue_routing: ['venue_routing', 'route'],
      execute: ['execute'],
      book_back: ['book_back', 'booked'],
    };
    const matchKeys = keyMap[stepKey] || [stepKey];
    return matchKeys.some(k => activeStep.detail.toLowerCase().includes(k) || activeStep.label.toLowerCase().includes(k));
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-slate-500">Loading architecture data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Three-Layer Architecture</h1>
        <p className="text-sm text-slate-700 mt-1">
          AMINA's modular architecture — Caddy as an institutional top-layer module
        </p>
      </div>

      {/* ─── Action Flow Selector ─── */}
      <Card title="Action Flow Visualizer" subtitle="Select an action to see how it traverses all three architectural layers">
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(ACTION_FLOWS) as ActionType[]).map(action => (
              <button
                key={action}
                onClick={() => { setSelectedAction(action); setActiveFlowStep(0); }}
                className={`px-3 py-2 text-xs font-medium rounded-md border transition-all ease-amina duration-200 ${
                  selectedAction === action
                    ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300/60 hover:text-ink-900'
                }`}
              >
                {action}
              </button>
            ))}
          </div>

          {currentFlow && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-3 font-medium">{currentFlow.description}</p>
              <div className="space-y-2">
                {currentFlow.steps.map((step, idx) => {
                  const layerLabel = step.layer === 'layer3' ? 'L3' : step.layer === 'layer2' ? 'L2' : 'L1';
                  const layerColor = step.layer === 'layer3' ? 'bg-teal-100 text-teal-700' : step.layer === 'layer2' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700';
                  const isActive = idx === activeFlowStep;
                  const isPast = idx < activeFlowStep;

                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 rounded-md p-2.5 transition-all ease-amina duration-300 ${
                        isActive ? 'bg-white border border-teal-300/60 shadow-2' : isPast ? 'bg-white/50' : 'bg-transparent'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          isActive ? 'bg-teal-700 text-white' : isPast ? 'bg-success-100 text-success-700' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isPast ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                        </div>
                        {idx < currentFlow.steps.length - 1 && (
                          <div className={`w-0.5 h-3 ${isPast ? 'bg-success-700' : 'bg-slate-300'}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${layerColor}`}>{layerLabel}</span>
                          <p className={`text-xs font-medium ${isActive ? 'text-ink-900' : 'text-slate-600'}`}>{step.label}</p>
                        </div>
                        <p className={`text-[10px] mt-0.5 ${isActive ? 'text-slate-700' : 'text-slate-400'}`}>{step.detail}</p>
                      </div>
                      {isActive && step.glEntryType && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium whitespace-nowrap">
                          GL: {step.glEntryType}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
                <span className="text-[9px] text-slate-400">Flow progress:</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-700 rounded-full transition-all ease-amina duration-500"
                    style={{ width: `${((activeFlowStep + 1) / currentFlow.steps.length) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-slate-500 font-mono">{activeFlowStep + 1}/{currentFlow.steps.length}</span>
              </div> */}
            </div>
          )}
        </div>
      </Card>

      {/* ─── Three Layer Cards ─── */}
      <div className="space-y-4 relative">
        {layers.map((layer, idx) => {
          const isExpanded = expandedLayer === layer.id;
          const Icon = idx === 0 ? Layers : idx === 1 ? GitBranch : Database;

          const isLayerActiveInFlow = currentFlow?.steps[activeFlowStep]?.layer === layer.id;

          return (
            <div key={layer.id} className="relative">
              {idx < layers.length - 1 && (
                <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-300 z-0" style={{ bottom: '-16px' }}>
                  <ArrowDown className="w-4 h-4 text-slate-400 absolute left-1/2 -translate-x-1/2 bottom-0" />
                </div>
              )}

              <Card title="" subtitle="">
                <div
                  className={`border-l-4 ${layer.accentColor} rounded-lg transition-all ease-amina duration-300 ${
                    isLayerActiveInFlow ? 'ring-2 ring-teal-300/50' : ''
                  }`}
                >
                  {/* Layer Header — clickable */}
                  <div
                    className="p-5 cursor-pointer hover:shadow-2 transition-all ease-amina duration-200"
                    onClick={() => toggleLayer(layer.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-md ${layer.bgColor} flex items-center justify-center ${isLayerActiveInFlow ? 'ring-2 ring-teal-300' : ''}`}>
                          <Icon className="w-5 h-5 text-ink-900" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-ink-900">{layer.name}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${layer.badgeColor}`}>
                            {layer.badgeLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLayerActiveInFlow && (
                          <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-teal-100 text-teal-700 rounded font-semibold animate-pulse">
                            <CircleDot className="w-3 h-3" /> Active
                          </span>
                        )}
                        <div className="text-slate-400">
                          {isExpanded ? '\u2212' : '+'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-4 px-5 pb-5 border-t border-slate-200 pt-4">

                      {/* ─── Layer 3: Interactive Module Grid ─── */}
                      {layer.id === 'layer3' && (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-slate-700 font-semibold mb-2">Modules <span className="font-normal text-slate-400">(click to explore)</span></p>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                              {layer.modules?.map((mod: any) => (
                                <div
                                  key={mod.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedModule(selectedModule === mod.id ? null : mod.id); }}
                                  className={`border rounded-md p-3 text-center cursor-pointer transition-all ease-amina duration-200 ${
                                    selectedModule === mod.id
                                      ? mod.highlighted
                                        ? 'border-teal-700 bg-teal-50 ring-2 ring-teal-300'
                                        : 'border-slate-400 bg-slate-50 ring-2 ring-slate-300'
                                      : mod.highlighted
                                        ? 'border-teal-700 bg-teal-50 hover:shadow-2'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2'
                                  }`}
                                >
                                  <mod.icon className={`w-4 h-4 mx-auto mb-1.5 ${selectedModule === mod.id ? 'text-teal-700' : mod.highlighted ? 'text-teal-700' : 'text-slate-400'}`} />
                                  <p className={`text-xs font-medium ${
                                    selectedModule === mod.id ? 'text-teal-700' : mod.highlighted ? 'text-teal-700' : 'text-slate-700'
                                  }`}>
                                    {mod.name}
                                  </p>
                                  {selectedModule === mod.id && (
                                    <ChevronRight className="w-3 h-3 mx-auto mt-1 text-teal-700" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Module Detail Panel */}
                          {currentModuleDetails && selectedModule && (
                            <div className="bg-white border border-slate-200 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-md bg-teal-100 flex items-center justify-center shrink-0">
                                  {(() => {
                                    const mod = (layer.modules as any[]).find(m => m.id === selectedModule);
                                    if (!mod) return null;
                                    const ModIcon = mod.icon;
                                    return <ModIcon className="w-4 h-4 text-teal-700" />;
                                  })()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-ink-900 font-semibold">{(layer.modules as any[]).find(m => m.id === selectedModule)?.name}</p>
                                  <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">{currentModuleDetails.description}</p>

                                  {currentModuleDetails.actions.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Supported Actions</p>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {currentModuleDetails.actions.map(action => (
                                          <button
                                            key={action}
                                            onClick={(e) => { e.stopPropagation(); setSelectedAction(action); setActiveFlowStep(0); }}
                                            className={`text-[9px] px-2 py-1 rounded font-medium border transition-all ${
                                              selectedAction === action
                                                ? 'bg-teal-700 text-white border-teal-700'
                                                : 'bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-400'
                                            }`}
                                          >
                                            {action}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {currentModuleDetails.dependencies.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Caddy Relies On</p>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {currentModuleDetails.dependencies.map(dep => (
                                          <span key={dep} className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                            {dep}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {currentModuleDetails.partners.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Partners</p>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {currentModuleDetails.partners.map(p => (
                                          <span key={p} className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">{p}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── Layer 2: Pipeline + Connected Programs ─── */}
                      {layer.id === 'layer2' && (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-slate-700 font-semibold mb-2">Pipeline Flow</p>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                              {layer.pipeline?.map((step: any, stepIdx: number) => {
                                const isHighlighted = isStepInFlow(layer.id, step.key);
                                return (
                                  <div key={step.key} className="flex items-center gap-2">
                                    <div className={`flex items-center gap-1.5 border rounded-md px-3 py-2 whitespace-nowrap transition-all duration-300 ${
                                      isHighlighted ? 'border-amber-700 bg-amber-100 ring-2 ring-amber-300' : 'border-amber-200 bg-amber-50'
                                    }`}>
                                      <step.icon className={`w-3 h-3 ${isHighlighted ? 'text-amber-700' : 'text-amber-400'}`} />
                                      <p className={`text-xs font-medium ${isHighlighted ? 'text-amber-700' : 'text-amber-600'}`}>{step.label}</p>
                                    </div>
                                    {stepIdx < (layer.pipeline?.length || 0) - 1 && (
                                      <ArrowRight className={`w-4 h-4 transition-colors duration-300 ${isHighlighted ? 'text-amber-700' : 'text-amber-300'}`} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-slate-700 font-semibold mb-2">Connected On-Chain Programs</p>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                              {layer.connectedPrograms?.map((prog: any) => (
                                <div key={prog.name} className="border border-slate-200 bg-white rounded-md p-2.5">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${prog.color}`}>{prog.name}</span>
                                  <p className="text-[10px] text-slate-500 mt-1">{prog.role}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ─── Layer 1: Core Banking Components ─── */}
                      {layer.id === 'layer1' && (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs text-slate-700 font-semibold mb-2">Core Banking Components</p>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                              {layer.components?.map((comp: any) => {
                                 const flowGlType = currentFlow?.steps.find(s => s.glEntryType)?.glEntryType;
                                 const isGLOrGL = comp.name === 'General Ledger' && flowGlType;
                                 const isComponentActive = currentFlow?.steps[activeFlowStep]?.layer === 'layer1' &&
                                   (comp.name === 'General Ledger' || (comp.name === 'SWIFT Payments' && !flowGlType));
                                 return (
                                   <div
                                     key={comp.name}
                                     className={`border rounded-md p-3 transition-all duration-300 ${
                                       isComponentActive
                                         ? 'border-slate-500 bg-slate-50 ring-2 ring-slate-300'
                                         : 'border-slate-200 bg-white'
                                     }`}
                                   >
                                     <div className="flex items-center gap-2 mb-1">
                                       <p className={`text-xs font-medium ${isComponentActive ? 'text-ink-900' : 'text-slate-700'}`}>
                                         {comp.name}
                                       </p>
                                       {isComponentActive && (
                                         <span className="text-[8px] px-1 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold animate-pulse">ACTIVE</span>
                                       )}
                                     </div>
                                     <p className="text-[10px] text-slate-500">{comp.desc}</p>
                                     {comp.types.length > 0 && (
                                       <div className="flex gap-1 flex-wrap mt-2">
                                         {comp.types.map((t: string) => (
                                           <span
                                             key={t}
                                             className={`text-[8px] px-1.5 py-0.5 rounded font-medium transition-all ${
                                               isGLOrGL && flowGlType === t
                                                 ? 'bg-slate-700 text-white'
                                                 : 'bg-slate-100 text-slate-600'
                                             }`}
                                           >
                                             {t}
                                           </span>
                                         ))}
                                       </div>
                                     )}
                                   </div>
                                 );
                               })}
                            </div>
                          </div>

                          {/* Book-Back Proof */}
                          <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Landmark className="w-4 h-4 text-slate-600" />
                              <p className="text-xs font-semibold text-ink-900">Finstar Book-Back Integration</p>
                            </div>
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                              Every capital movement in Layer 3 triggers an automatic book-back via the Translation Layer (L2) to Finstar (L1).
                              The General Ledger records double-entry postings with SWIFT references, jurisdiction tags, and audit trail references.
                              Regulatory reports are generated per jurisdiction (CH, AE, HK, SG) and filed automatically.
                            </p>
                            <div className="grid grid-cols-3 gap-2 mt-3">
                              <div className="bg-white rounded-md p-2 text-center">
                                <p className="text-xs font-bold text-ink-900 font-mono">{stats.finstarGLEntries}</p>
                                <p className="text-[9px] text-slate-500">GL Entries</p>
                              </div>
                              <div className="bg-white rounded-md p-2 text-center">
                                <p className="text-xs font-bold text-success-700 font-mono">{fmt(stats.finstarTotalCredits)}</p>
                                <p className="text-[9px] text-slate-500">Credits</p>
                              </div>
                              <div className="bg-white rounded-md p-2 text-center">
                                <p className="text-xs font-bold text-error-700 font-mono">{fmt(stats.finstarTotalDebits)}</p>
                                <p className="text-[9px] text-slate-500">Debits</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live Stats */}
                      <div>
                        <p className="text-xs text-slate-700 font-semibold mb-2">Live Stats</p>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {layer.liveStats?.map((stat: any) => {
                            const StatIcon = stat.icon;
                            return (
                              <div
                                key={stat.label}
                                className="bg-white border border-slate-200 rounded-md p-3 flex items-center gap-3"
                              >
                                <StatIcon className="w-5 h-5 text-teal-700" />
                                <div>
                                  <p className="text-lg font-bold text-ink-900 font-mono">{stat.value}</p>
                                  <p className="text-[10px] text-slate-500">{stat.label}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Named Partners/Integrations */}
                      {(layer.namedPartners || layer.namedIntegrations) && (
                        <div>
                          <p className="text-xs text-slate-700 font-semibold mb-2">
                            {layer.namedPartners ? 'Named Partners' : 'Named Integrations'}
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {(layer.namedPartners || layer.namedIntegrations)?.map((partner: string) => (
                              <span
                                key={partner}
                                className="text-[10px] font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded border border-slate-200"
                              >
                                {partner}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Positioning Statement */}
      <Card title="Positioning Statement" subtitle="Caddy's role in AMINA's architecture">
        <div className="bg-teal-50 border border-teal-700/20 rounded-lg p-5">
          <Lock className="w-6 h-6 text-teal-700 mb-3" />
          <p className="text-sm text-ink-900 italic leading-relaxed">
            "Caddy is an institutional top-layer module that snaps into AMINA's three-layer
            architecture via the translation layer. We respect the translation layer as AMINA's
            critical IP."
          </p>
        </div>
      </Card>

      {/* Client Segments Table */}
      <Card title="Client Segments" subtitle="Caddy's fit across AMINA's customer base">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 pr-3 font-semibold">AMINA Segment</th>
                <th className="text-left py-2 font-semibold">Caddy Fit</th>
              </tr>
            </thead>
            <tbody>
              {clientSegments.map((seg, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-200/50 hover:bg-teal-50 transition-colors"
                >
                  <td className="py-2.5 pr-3 text-ink-900 font-medium">{seg.segment}</td>
                  <td className="py-2.5 text-slate-700">{seg.fit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Named Partners Grid */}
      <Card title="Named Partners" subtitle="Ecosystem integrations across all three layers">
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
          {namedPartners.map((partner) => {
            const PartnerIcon = partner.icon;
            return (
              <div
                key={partner.name}
                className="bg-white border border-slate-200 rounded-md p-4 text-center hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200"
              >
                <div className="w-10 h-10 rounded-md bg-teal-100 flex items-center justify-center mx-auto mb-2">
                  <PartnerIcon className="w-5 h-5 text-teal-700" />
                </div>
                <p className="text-xs font-medium text-ink-900">{partner.name}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
