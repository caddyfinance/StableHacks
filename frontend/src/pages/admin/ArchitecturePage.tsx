import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import {
  Layers, ArrowDown, CheckCircle, Building2, Shield, TrendingUp,
  Activity, DollarSign, FileText, Globe, Lock, Zap, Server,
  Database, GitBranch, Radio, Wallet, BarChart3,
} from 'lucide-react';

const fmt = (v: any) => {
  if (v === null || v === undefined || isNaN(v)) return '0.00';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Layer state type
interface LayerStats {
  vaultCount: number;
  totalAUM: number;
  strategiesCount: number;
  tlInstructionsProcessed: number;
  tlPipelineCompletions: number;
  finstarGLEntries: number;
}

export default function ArchitecturePage() {
  const [expandedLayer, setExpandedLayer] = useState<string | null>('layer3');
  const [stats, setStats] = useState<LayerStats>({
    vaultCount: 0,
    totalAUM: 0,
    strategiesCount: 0,
    tlInstructionsProcessed: 0,
    tlPipelineCompletions: 0,
    finstarGLEntries: 0,
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
          finstarGLEntries: finstarConfig?.totalGLEntries || 0,
        });
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  const toggleLayer = (layer: string) => {
    setExpandedLayer(expandedLayer === layer ? null : layer);
  };

  const layers = [
    {
      id: 'layer3',
      name: 'Layer 3 — Crypto Services',
      badgeLabel: 'Caddy Module',
      badgeColor: 'bg-teal-100 text-teal-700',
      accentColor: 'border-teal-700',
      bgColor: 'bg-teal-50',
      modules: [
        { name: 'Caddy Yield Module', highlighted: true },
        { name: 'AMINA Rewards Engine', highlighted: false },
        { name: 'Off-Exchange Custody', highlighted: false },
        { name: 'Lombard Lending', highlighted: false },
      ],
      liveStats: [
        { label: 'Vaults', value: stats.vaultCount, icon: Wallet },
        { label: 'Total AUM', value: `$${fmt(stats.totalAUM)}`, icon: DollarSign },
        { label: 'Active Strategies', value: stats.strategiesCount, icon: Activity },
      ],
      namedPartners: ['Solstice'],
    },
    {
      id: 'layer2',
      name: 'Layer 2 — Translation Layer',
      badgeLabel: 'AMINA Proprietary IP',
      badgeColor: 'bg-amber-100 text-amber-700',
      accentColor: 'border-amber-700',
      bgColor: 'bg-amber-50',
      pipeline: [
        'Instruction',
        'Jurisdiction Check',
        'Travel Rule',
        'Venue Routing',
        'Execute',
        'Book-Back',
      ],
      liveStats: [
        { label: 'Instructions Processed', value: stats.tlInstructionsProcessed, icon: FileText },
        { label: 'Pipeline Completions', value: stats.tlPipelineCompletions, icon: CheckCircle },
      ],
      namedIntegrations: ['Notabene', 'Mesh', 'SAS'],
    },
    {
      id: 'layer1',
      name: 'Layer 1 — Core Banking',
      badgeLabel: 'Finstar (via HBL ASP/BSP)',
      badgeColor: 'bg-slate-100 text-slate-700',
      accentColor: 'border-slate-700',
      bgColor: 'bg-slate-50',
      components: ['Payments', 'Regulatory Reporting', 'SWIFT', 'General Ledger'],
      liveStats: [
        { label: 'Total GL Entries', value: stats.finstarGLEntries, icon: Database },
      ],
      namedPartners: ['Finstar', 'HBL'],
    },
  ];

  const clientSegments = [
    {
      segment: 'Individuals (professional investors)',
      fit: 'Yield module via mobile/web',
    },
    {
      segment: 'Corporates',
      fit: 'Payments-ops via APIs into treasury tooling',
    },
    {
      segment: 'Banks and fintechs (B2B2C)',
      fit: 'White-label for AMINA\'s B2B2C partners',
    },
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

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-slate-500">Loading architecture data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink-900">Three-Layer Architecture</h1>
        <p className="text-sm text-slate-700 mt-1">
          AMINA's modular architecture — Caddy as an institutional top-layer module
        </p>
      </div>

      {/* Three Layer Cards */}
      <div className="space-y-4 relative">
        {layers.map((layer, idx) => {
          const isExpanded = expandedLayer === layer.id;
          const Icon = idx === 0 ? Layers : idx === 1 ? GitBranch : Database;

          return (
            <div key={layer.id} className="relative">
              {/* Connecting Arrow (between layers) */}
              {idx < layers.length - 1 && (
                <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-300 z-0" style={{ bottom: '-16px' }}>
                  <ArrowDown className="w-4 h-4 text-slate-400 absolute left-1/2 -translate-x-1/2 bottom-0" />
                </div>
              )}

              {/* Layer Card */}
              <Card
                title=""
                subtitle=""
              >
                <div
                  className={`border-l-4 ${layer.accentColor} rounded-lg p-5 cursor-pointer hover:shadow-2 transition-all ease-amina duration-200`}
                  onClick={() => toggleLayer(layer.id)}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-md ${layer.bgColor} flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-ink-900" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-ink-900">{layer.name}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${layer.badgeColor}`}>
                          {layer.badgeLabel}
                        </span>
                      </div>
                    </div>
                    <div className="text-slate-400">
                      {isExpanded ? '−' : '+'}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-4 mt-5 border-t border-slate-200 pt-4">
                      {/* Layer 3 — Modules Grid */}
                      {layer.id === 'layer3' && (
                        <div>
                          <p className="text-xs text-slate-700 font-semibold mb-2">Modules</p>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {layer.modules?.map((mod) => (
                              <div
                                key={mod.name}
                                className={`border rounded-md p-3 text-center ${
                                  mod.highlighted
                                    ? 'border-teal-700 bg-teal-50'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <p
                                  className={`text-xs font-medium ${
                                    mod.highlighted ? 'text-teal-700' : 'text-slate-700'
                                  }`}
                                >
                                  {mod.name}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Layer 2 — Pipeline Visualization */}
                      {layer.id === 'layer2' && (
                        <div>
                          <p className="text-xs text-slate-700 font-semibold mb-2">Pipeline Flow</p>
                          <div className="flex items-center gap-2 overflow-x-auto pb-2">
                            {layer.pipeline?.map((step, stepIdx) => (
                              <div key={step} className="flex items-center gap-2">
                                <div className="bg-amber-100 border border-amber-700 rounded-md px-3 py-2 whitespace-nowrap">
                                  <p className="text-xs font-medium text-amber-700">{step}</p>
                                </div>
                                {stepIdx < (layer.pipeline?.length || 0) - 1 && (
                                  <ArrowDown className="w-4 h-4 text-amber-700 rotate-[-90deg]" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Layer 1 — Components */}
                      {layer.id === 'layer1' && (
                        <div>
                          <p className="text-xs text-slate-700 font-semibold mb-2">Components</p>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {layer.components?.map((comp) => (
                              <div
                                key={comp}
                                className="border border-slate-200 bg-white rounded-md p-3 text-center"
                              >
                                <p className="text-xs font-medium text-slate-700">{comp}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Stats */}
                      <div>
                        <p className="text-xs text-slate-700 font-semibold mb-2">Live Stats</p>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {layer.liveStats?.map((stat) => {
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
                            {(layer.namedPartners || layer.namedIntegrations)?.map((partner) => (
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
