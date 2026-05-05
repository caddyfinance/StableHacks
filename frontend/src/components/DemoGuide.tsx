import { useState } from 'react';
import { HelpCircle, X, ChevronRight, ChevronLeft } from 'lucide-react';

const DEMO_STEPS = [
  { title: 'Welcome to AMINA', desc: 'Institutional yield vault platform built on Solana. Three-layer architecture: Core Banking → Translation Layer → Crypto Services.' },
  { title: '1. Issue Credential', desc: 'Navigate to Credentials page. Issue a SAS (Segregated Account Structure) credential for an institutional client.' },
  { title: '2. Create Vault', desc: 'Go to Vault Factory. Create a segregated, non-pooled vault tied to the credential. Each vault is 1:1 with a client.' },
  { title: '3. Configure Mandate', desc: 'Set investment mandate — approved strategies, risk limits, destination whitelist, and the 10% liquidity buffer.' },
  { title: '4. Fund Vault', desc: 'Deposit USDC into the vault. Funds are tracked with on-chain provenance and Finstar GL entries.' },
  { title: '5. Deploy Capital', desc: 'Portfolio Manager deploys capital into Solstice eUSX yield vault. Real on-chain lock (USX → eUSX).' },
  { title: '6. Translation Layer', desc: 'Every instruction routes through AMINA Layer 2: jurisdiction check, travel rule, compliance attestation, routing, GL book-back — all on-chain PDAs.' },
  { title: '7. Compliance', desc: 'Run the 12-check compliance suite. View audit trail, perimeter classification, and Chainalysis integration points.' },
  { title: '8. Emergency Controls', desc: '24/7 operations centre. Pause vaults, disable adapters, initiate strategy unwinds.' },
];

export default function DemoGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-40 w-12 h-12 bg-teal-700 hover:bg-teal-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Demo Guide"
      >
        <HelpCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-6 z-40 w-80 bg-white border border-slate-200 rounded-[18px] shadow-2 overflow-hidden">
      <div className="bg-teal-700 text-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold">AMINA Demo Guide</p>
          <p className="text-[10px] text-teal-200">Step {step + 1} of {DEMO_STEPS.length}</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-teal-200 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-bold text-ink-900 mb-1">{DEMO_STEPS[step].title}</h3>
        <p className="text-xs text-slate-600 leading-relaxed">{DEMO_STEPS[step].desc}</p>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-ink-900 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> Previous
        </button>
        <div className="flex gap-1">
          {DEMO_STEPS.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-teal-700' : i < step ? 'bg-teal-300' : 'bg-slate-200'}`} />
          ))}
        </div>
        <button
          onClick={() => setStep(Math.min(DEMO_STEPS.length - 1, step + 1))}
          disabled={step === DEMO_STEPS.length - 1}
          className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 disabled:opacity-30 transition-colors font-medium"
        >
          Next <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
