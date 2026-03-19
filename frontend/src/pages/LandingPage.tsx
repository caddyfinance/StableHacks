import { useNavigate } from 'react-router-dom';
import { Shield, Building2, Lock, Eye, ArrowRight, CheckCircle } from 'lucide-react';

const capabilities = [
  {
    icon: Building2,
    title: 'Per-Client Segregation',
    description: 'No co-mingled funds. Each client gets a dedicated vault with isolated balances.',
  },
  {
    icon: Shield,
    title: 'SAS-Compatible Permissioning',
    description: 'Pseudonymous institutional credentials without PII on-chain.',
  },
  {
    icon: Lock,
    title: 'Mandate-Constrained Execution',
    description: 'Strategy limits, allocation caps, and liquidity buffers enforced in the execution path.',
  },
  {
    icon: Eye,
    title: 'Compliance-Ready Telemetry',
    description: 'Every material action produces a structured compliance event for audit trails.',
  },
];

const steps = [
  { number: 1, title: 'Issue Credential', description: 'Approve institutional client with SAS-compatible credential' },
  { number: 2, title: 'Create Vault', description: 'Deploy segregated, non-pooled vault per client' },
  { number: 3, title: 'Bind Mandate', description: 'Attach strategy limits, destination controls, consent thresholds' },
  { number: 4, title: 'Deploy Capital', description: 'Allocate within policy to approved strategies' },
  { number: 5, title: 'Monitor & Exit', description: 'Compliance trail, consent gates, controlled redemption' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* Hero Section */}
      <section className="relative px-6 pt-24 pb-20 overflow-hidden">
        {/* Subtle gradient glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-white to-white" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[radial-gradient(circle_at_top_right,rgba(25,161,165,0.12),transparent_45%)]" />

        <div className="relative max-w-6xl mx-auto text-center">
          <span className="inline-block text-xs font-semibold tracking-[0.2em] text-teal-700 uppercase mb-6 px-4 py-1.5 border border-teal-300/40 rounded-full bg-teal-100">
            AMINA Institutional Vault Framework
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight mb-6 text-ink-900">
            Segregated Yield Vaults<br />for Institutional Clients
          </h1>
          <p className="max-w-3xl mx-auto text-lg text-slate-600 leading-relaxed mb-10">
            A bank-ready control framework where each approved institutional client receives a dedicated,
            non-pooled vault with SAS-compatible permissioning, mandate-constrained execution, compliance
            telemetry, and client-protective controls.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/login/amina')}
              className="flex items-center gap-2 px-8 py-3.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-[12px] transition-all ease-amina duration-150 text-sm tracking-wide shadow-1"
            >
              AMINA Administration
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/login/client')}
              className="flex items-center gap-2 px-8 py-3.5 border border-teal-700 hover:bg-teal-50 text-teal-700 font-semibold rounded-[12px] transition-all ease-amina duration-150 text-sm tracking-wide"
            >
              Client Portal
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Key Capabilities */}
      <section className="px-6 py-20 border-t border-slate-200 bg-amina-surface-secondary">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center text-ink-900 mb-4">Key Capabilities</h2>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto">
            Purpose-built for regulated institutions that require segregation, auditability, and control.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((cap) => (
              <div
                key={cap.title}
                className="bg-white border border-slate-200 rounded-[18px] p-6 hover:border-teal-300/60 hover:shadow-2 transition-all ease-amina duration-200"
              >
                <div className="w-10 h-10 rounded-[12px] bg-teal-100 flex items-center justify-center mb-4">
                  <cap.icon className="w-5 h-5 text-teal-700" />
                </div>
                <h3 className="text-ink-900 font-semibold mb-2">{cap.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 border-t border-slate-200">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center text-ink-900 mb-4">How It Works</h2>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto">
            From credential issuance to controlled redemption in five steps.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {steps.map((step, idx) => (
              <div key={step.number} className="relative text-center">
                <div className="w-12 h-12 rounded-full bg-teal-100 border border-teal-300/40 flex items-center justify-center mx-auto mb-4">
                  <span className="text-teal-700 font-bold text-lg">{step.number}</span>
                </div>
                <h3 className="text-ink-900 font-semibold text-sm mb-2">{step.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{step.description}</p>
                {idx < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-6 -right-3 w-4 h-4 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-slate-200 bg-amina-surface-secondary">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-slate-500 mb-2">
            AMINA Institutional Yield Vault — Hackathon Demo v1.0
          </p>
          <p className="text-xs text-slate-400">
            Not a live bank integration. A credible institutional control framework for pilot evaluation.
          </p>
        </div>
      </footer>
    </div>
  );
}
