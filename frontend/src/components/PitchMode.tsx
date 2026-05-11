import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Presentation, Play } from 'lucide-react';
import { useStore } from '../store/useStore';

const PITCH_SLIDES: { title: string; subtitle?: string; points: string[]; isDemo?: boolean }[] = [
  {
    title: 'Caddy Finance',
    subtitle: 'Institutional Yield Vault Platform',
    points: ['Segregated, non-pooled vaults for institutional clients', 'Built on Solana, real on-chain transactions', 'Bank-grade compliance: KYT, OFAC, Travel Rule on every movement'],
  },
  {
    title: 'The Problem',
    subtitle: 'Institutional DeFi access is broken',
    points: ['Banks cannot custody crypto assets in pooled structures', 'Regulatory requirements demand segregation and audit trails', 'No bridge between core banking and on-chain yield'],
  },
  {
    title: 'Our Approach',
    subtitle: 'Operationalise the bank\'s approval decision',
    points: ['We do not try to replace legal and risk due diligence', 'Once Solstice is approved, the vault enforces which clients, vaults, managers, wallets, limits, and transfer checks are allowed', 'Bank-controlled provider state: approved, restricted, or revoked'],
  },
  {
    title: 'Three-Layer Architecture',
    subtitle: "AMINA's core IP",
    points: ['Layer 1: Finstar/HBL Core Banking — GL entries, settlement', 'Layer 2: Translation Layer — compliance, routing, attestation (on-chain PDAs)', 'Layer 3: Crypto Services (Caddy) — vault operations, yield protocols'],
  },
  {
    title: 'Compliance Infrastructure',
    subtitle: 'Bank-grade transfer controls',
    points: ['Approved Provider Profile — bank evaluates, vault enforces', 'Wallet Controller Registry — who controls every address', 'Transfer Check Matrix — KYT + OFAC + Travel Rule per movement (never merged)', 'Exportable compliance report with full attribution'],
  },
  {
    title: 'Translation Layer',
    subtitle: 'On-chain compliance orchestration',
    points: ['Every instruction: jurisdiction → travel rule → compliance → routing → GL book-back', '5 on-chain PDAs per instruction: InstructionLog, ComplianceAttestation, TravelRuleCheck, RoutingDecision, GLEntry', 'Full audit trail — immutable, verifiable, real-time'],
  },
  {
    title: 'Live Demo',
    subtitle: 'What you are about to see — real Solana devnet',
    isDemo: true,
    points: [
      'Issue SAS credential → create segregated vault → set mandate with 10% liquidity buffer',
      'Deposit USDC → automatic KYT + OFAC + Travel Rule checks fire on-chain',
      'Portfolio Manager deploys to Solstice → pre-execution checks enforce provider approval + mandate fit + exposure limit',
      'Every wallet labelled with its controller — full attribution from source to destination',
      'Translation Layer routes each instruction through 5 on-chain PDAs with compliance attestation',
      'Export full compliance report — credential, mandate, providers, checks, explorer links',
    ],
  },
  {
    title: 'Key Differentiators',
    subtitle: 'Why Caddy Finance wins',
    points: ['Segregated Account Structure (SAS) — 1:1 client:vault', '10% mandatory liquidity buffer — protocol-level safety', 'Real yield via Solstice — not simulated', 'Bank-controlled provider approval with exposure limits'],
  },
];

export default function PitchMode() {
  const { demoModeActive, setDemoMode } = useStore();
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!demoModeActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setSlide(s => Math.min(PITCH_SLIDES.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setSlide(s => Math.max(0, s - 1));
      if (e.key === 'Escape') setDemoMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [demoModeActive, setDemoMode]);

  if (!demoModeActive) return null;

  const current = PITCH_SLIDES[slide];

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <Presentation className="w-5 h-5 text-teal-400" />
          <span className="text-sm text-teal-400 font-medium">Pitch Mode</span>
          <span className="text-xs text-slate-500">Slide {slide + 1}/{PITCH_SLIDES.length}</span>
        </div>
        <button onClick={() => setDemoMode(false)} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-16">
        <div className="max-w-3xl w-full space-y-8">
          <div>
            <h1 className="text-5xl font-bold text-white tracking-tight">{current.title}</h1>
            {current.subtitle && <p className="text-xl text-teal-400 mt-3">{current.subtitle}</p>}
          </div>
          <div className="space-y-4">
            {current.points.map((point, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-teal-700/30 border border-teal-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-teal-400">{i + 1}</span>
                </div>
                <p className="text-lg text-slate-200 leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
          {current.isDemo && (
            <button
              onClick={() => setDemoMode(false)}
              className="mt-6 inline-flex items-center gap-3 px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-teal-500/20"
            >
              <Play className="w-5 h-5" />
              Start Live Demo
            </button>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between px-8 py-6">
        <button
          onClick={() => setSlide(Math.max(0, slide - 1))}
          disabled={slide === 0}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex gap-2">
          {PITCH_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${i === slide ? 'bg-teal-400 scale-125' : i < slide ? 'bg-teal-700' : 'bg-slate-600'}`}
            />
          ))}
        </div>
        <button
          onClick={() => setSlide(Math.min(PITCH_SLIDES.length - 1, slide + 1))}
          disabled={slide === PITCH_SLIDES.length - 1}
          className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 disabled:opacity-20 transition-colors font-medium"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
        <p className="text-[10px] text-slate-600">Use arrow keys to navigate, Escape to exit</p>
      </div>
    </div>
  );
}
