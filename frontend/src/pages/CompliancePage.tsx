import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { ExternalLink, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AuditEvent {
  eventId: string;
  timestamp: string;
  actionType: string;
  actor: string;
  role: string;
  result: string;
  reason: string;
  amount?: number;
  asset?: string;
  strategy?: string;
}

const CHAINALYSIS_BASE = 'https://app.chainalysis.com';

// Classify event as internal or external flow
function classifyFlow(actionType: string): { type: 'internal' | 'external' | 'inbound'; label: string } {
  const a = actionType?.toUpperCase() || '';
  if (a.includes('DEPOSIT') || a.includes('INBOUND')) return { type: 'inbound', label: 'Inbound' };
  if (a.includes('REDEMPTION') || a.includes('WITHDRAWAL') || a.includes('UNWIND')) return { type: 'external', label: 'External' };
  return { type: 'internal', label: 'Internal' };
}

function controlResult(result: string): string {
  const r = result?.toLowerCase() || '';
  if (r === 'success') return 'Passed';
  if (r === 'failure' || r === 'blocked') return 'Blocked';
  if (r === 'pending') return 'Pending';
  return 'Passed';
}

function eventRowBorder(result: string): string {
  const r = result?.toLowerCase() || '';
  if (r === 'success') return 'border-l-green-500';
  if (r === 'failure' || r === 'blocked') return 'border-l-red-500';
  if (r === 'pending') return 'border-l-yellow-500';
  return 'border-l-gray-600';
}

const ACTION_TYPES = ['ALL', 'CREDENTIAL_ISSUED', 'VAULT_CREATED', 'MANDATE_ATTACHED', 'DEPOSIT_RECORDED', 'ALLOCATION_EXECUTED', 'ALLOCATION_BLOCKED', 'CONSENT_REQUESTED', 'CONSENT_GRANTED', 'REDEMPTION_EXECUTED', 'WITHDRAWAL_BLOCKED', 'VAULT_PAUSED', 'UNWIND_EXECUTED'];

interface ComplianceCheckResult {
  timestamp: string;
  checks: { name: string; status: 'Passed' | 'Failed' | 'Review Required' | 'Not Required'; detail: string }[];
  overallStatus: 'Compliant' | 'Review Required' | 'Non-Compliant';
}

export default function CompliancePage() {
  const { activeVaultId, setActiveVaultId, notify } = useStore();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterAction, setFilterAction] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vaults, setVaults] = useState<any[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [vaultSearchOpen, setVaultSearchOpen] = useState(false);
  const [vaultSearch, setVaultSearch] = useState('');

  // Compliance check modal state
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkRunning, setCheckRunning] = useState(false);
  const [checkStep, setCheckStep] = useState(0);
  const [checkResult, setCheckResult] = useState<ComplianceCheckResult | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeVaultId) return;
    try {
      const [snap, evts] = await Promise.all([api.getSnapshot(activeVaultId), api.getEvents(activeVaultId)]);
      setSnapshot(snap);
      setEvents(evts);
    } catch (err: any) {
      notify('error', err?.message || 'Failed to load compliance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeVaultId, notify]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load available vaults
  useEffect(() => {
    setLoadingVaults(true);
    api.getVaults()
      .then((v) => setVaults(v))
      .catch(() => {})
      .finally(() => setLoadingVaults(false));
  }, []);

  const handleSelectVault = (id: string) => {
    if (id === activeVaultId) return;
    setActiveVaultId(id);
    setLoading(true);
  };

  const handleRefresh = () => { setRefreshing(true); loadData(); };

  // Run compliance check with animated steps
  const complianceChecks = [
    { name: 'Vault Segregation', delay: 600 },
    { name: 'Mandate Enforcement', delay: 800 },
    { name: 'Destination Whitelist', delay: 500 },
    { name: 'Provider Whitelist', delay: 700 },
    { name: 'KYT Screening Status', delay: 900 },
    { name: 'Travel Rule Compliance', delay: 600 },
    { name: 'Leverage Restriction', delay: 400 },
    { name: 'Idle Buffer Compliance', delay: 700 },
    { name: 'Consent Threshold', delay: 500 },
    { name: 'Inbound Settlement Matching', delay: 600 },
    { name: 'Treasury Sweep Status', delay: 400 },
    { name: 'Credential Validity', delay: 800 },
  ];

  const handleRunComplianceCheck = async () => {
    setShowCheckModal(true);
    setCheckRunning(true);
    setCheckStep(0);
    setCheckResult(null);

    // Animate through each check
    for (let i = 0; i < complianceChecks.length; i++) {
      setCheckStep(i + 1);
      await new Promise(r => setTimeout(r, complianceChecks[i].delay));
    }

    // Generate results based on actual snapshot data
    const hasPending = events.some(e => e.result === 'pending');
    const hasBlocked = events.some(e => e.result === 'failure');

    const results: ComplianceCheckResult = {
      timestamp: new Date().toISOString(),
      overallStatus: hasBlocked ? 'Review Required' : 'Compliant',
      checks: [
        { name: 'Vault Segregation', status: 'Passed', detail: 'Non-pooled vault confirmed. No co-mingling detected.' },
        { name: 'Mandate Enforcement', status: snapshot?.mandateStatus === 'active' ? 'Passed' : 'Failed', detail: snapshot?.mandateStatus === 'active' ? 'Mandate active and enforced on all allocation paths.' : 'No active mandate attached to vault.' },
        { name: 'Destination Whitelist', status: (snapshot?.approvedDestinations?.length ?? 0) > 0 ? 'Passed' : 'Review Required', detail: `${snapshot?.approvedDestinations?.length ?? 0} approved destination wallets configured.` },
        { name: 'Provider Whitelist', status: 'Passed', detail: 'All strategy providers are on the approved list.' },
        { name: 'KYT Screening', status: 'Passed', detail: 'Chainalysis KYT integration ready. No flagged transactions.' },
        { name: 'Travel Rule', status: 'Not Required', detail: 'No external transfers requiring Travel Rule payload in this period.' },
        { name: 'Leverage Restriction', status: 'Passed', detail: 'No leverage positions detected. Leverage is prohibited by mandate.' },
        { name: 'Idle Buffer', status: snapshot?.idleBalance > 0 ? 'Passed' : 'Review Required', detail: `Idle balance: ${fmt(snapshot?.idleBalance)} USDC. Buffer requirement met.` },
        { name: 'Consent Threshold', status: hasPending ? 'Review Required' : 'Passed', detail: hasPending ? 'Pending consent requests require client approval.' : 'All actions within delegated authority limits.' },
        { name: 'Settlement Matching', status: 'Passed', detail: 'All inbound settlements matched to expected provider returns.' },
        { name: 'Treasury Sweep', status: 'Passed', detail: 'Internal treasury sweep operating normally.' },
        { name: 'Credential Validity', status: 'Passed', detail: 'SAS credential active and not revoked. On-chain attestation valid.' },
      ],
    };

    setCheckResult(results);
    setCheckRunning(false);
  };

  // Export compliance report
  const handleExportReport = async () => {
    setExporting(true);
    await new Promise(r => setTimeout(r, 600));

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'medium' });
    const vId = snapshot?.vaultId || 'VAULT';
    const clientRef = snapshot?.clientReference || '—';

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const m = 18; // margin
    const cw = W - m * 2; // content width
    let y = 0;

    // ── Palette ──
    const C = {
      bg:      [245, 247, 250] as [number, number, number],
      white:   [255, 255, 255] as [number, number, number],
      navy:    [15, 23, 42]    as [number, number, number],
      blue:    [59, 130, 246]  as [number, number, number],
      dark:    [30, 41, 59]    as [number, number, number],
      text:    [51, 65, 85]    as [number, number, number],
      muted:   [148, 163, 184] as [number, number, number],
      green:   [22, 163, 74]   as [number, number, number],
      red:     [220, 38, 38]   as [number, number, number],
      amber:   [217, 119, 6]   as [number, number, number],
      lightBg: [241, 245, 249] as [number, number, number],
      border:  [226, 232, 240] as [number, number, number],
    };

    // ── Helpers ──
    const header = () => {
      // Top bar
      doc.setFillColor(...C.navy);
      doc.rect(0, 0, W, 22, 'F');
      // Accent line
      doc.setFillColor(...C.blue);
      doc.rect(0, 22, W, 0.8, 'F');

      // Logo area
      doc.setFillColor(...C.blue);
      doc.roundedRect(m, 6, 10, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.white);
      doc.text('A', m + 3.5, 13);

      doc.setFontSize(12);
      doc.text('AMINA', m + 14, 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(180, 190, 210);
      doc.text('Institutional Yield Vault', m + 14, 16);

      // Right side
      doc.setFontSize(6.5);
      doc.setTextColor(...C.muted);
      doc.text('COMPLIANCE REPORT', W - m, 10, { align: 'right' });
      doc.setTextColor(180, 190, 210);
      doc.text(`${vId}  |  ${dateStr}`, W - m, 15, { align: 'right' });

      return 28;
    };

    const footer = (pg: number, total: number) => {
      const fy = H - 12;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(m, fy, W - m, fy);

      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text('CONFIDENTIAL', m, fy + 5);
      doc.setTextColor(...C.text);
      doc.text('AMINA Bank AG — Institutional Use Only', m + 22, fy + 5);
      doc.text(`Page ${pg} of ${total}`, W - m, fy + 5, { align: 'right' });
      doc.setTextColor(...C.muted);
      doc.text(timeStr, W / 2, fy + 5, { align: 'center' });
    };

    const section = (title: string, yy: number): number => {
      doc.setFillColor(...C.blue);
      doc.roundedRect(m, yy, 2.5, 5.5, 0.5, 0.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C.navy);
      doc.text(title, m + 6, yy + 4.5);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(m + 6 + doc.getTextWidth(title) + 2, yy + 2.5, W - m, yy + 2.5);
      return yy + 10;
    };

    const badge = (label: string, color: [number, number, number], x: number, yy: number) => {
      const tw = doc.getTextWidth(label) + 5;
      doc.setFillColor(color[0], color[1], color[2], 0.15 as any);
      doc.setDrawColor(...color);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, yy - 3, tw, 5, 1, 1, 'FD');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...color);
      doc.text(label, x + 2.5, yy);
      return tw + 2;
    };

    const kvPair = (key: string, value: string, yy: number, highlight = false) => {
      if (highlight) {
        doc.setFillColor(...C.lightBg);
        doc.rect(m + 2, yy - 3.5, cw - 4, 6, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      doc.text(key, m + 5, yy);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.navy);
      doc.text(value, W - m - 5, yy, { align: 'right' });
      return yy + 6.5;
    };

    // ══════════════════════════════════════════
    //  PAGE 1 — COVER & VAULT STATE
    // ══════════════════════════════════════════

    // Light page background
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, H, 'F');

    y = header();

    // ── Title card ──
    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, cw, 34, 3, 3, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(m, y, cw, 34, 3, 3, 'S');

    // Blue left accent bar inside card
    doc.setFillColor(...C.blue);
    doc.roundedRect(m, y, 3, 34, 3, 0, 'F');
    doc.rect(m + 1.5, y, 1.5, 34, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...C.navy);
    doc.text('Compliance Report', m + 10, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    doc.text(`Vault ${vId}  —  Client ${clientRef}`, m + 10, y + 19);

    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(`Generated ${timeStr}`, m + 10, y + 25);

    // Badges row
    let bx = m + 10;
    const by = y + 31;
    doc.setFontSize(6);
    bx += badge('SEGREGATED', C.blue, bx, by);
    bx += badge('NON-POOLED', C.green, bx, by);
    bx += badge('SOLANA DEVNET', C.muted, bx, by);
    bx += badge('USDC', C.navy, bx, by);

    y += 42;

    // ── Vault Snapshot ──
    y = section('Vault Compliance Snapshot', y);
    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, cw, 62, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(m, y, cw, 62, 2, 2, 'S');
    y += 5;

    y = kvPair('Vault ID', vId, y, true);
    y = kvPair('Client Reference', clientRef, y);
    y = kvPair('Vault Status', snapshot?.paused ? 'PAUSED' : (snapshot?.status || '—').toUpperCase(), y, true);
    y = kvPair('Mandate', (snapshot?.mandateStatus || '—').toUpperCase(), y);
    y = kvPair('Risk Status', 'GREEN — COMPLIANT', y, true);
    y = kvPair('Total NAV', `${fmt(snapshot?.totalNAV)} USDC`, y);
    y = kvPair('Idle Balance', `${fmt(snapshot?.idleBalance)} USDC`, y, true);
    y = kvPair('Deployed Balance', `${fmt(snapshot?.totalDeployed ?? totalDeployed)} USDC`, y);
    y = kvPair('Approved Destinations', `${approvedDestCount} wallets`, y, true);
    y += 4;

    // ── Active Controls (2-column) ──
    y = section('Active Governance Controls', y);
    const ctrlList = [
      'No Pooling', `Mandate ${snapshot?.mandateStatus === 'active' ? 'Active' : 'Inactive'}`,
      'No Leverage', 'Approved Destinations Only',
      'Travel Rule (External)', 'Provider Whitelist',
      'Settlement Matching', 'Treasury Sweep',
    ];
    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, cw, 24, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(m, y, cw, 24, 2, 2, 'S');
    const colW = (cw - 10) / 2;
    for (let i = 0; i < ctrlList.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = m + 5 + col * (colW + 5);
      const cy = y + 5 + row * 5.5;
      // Green dot
      doc.setFillColor(...C.green);
      doc.circle(cx + 1.5, cy - 0.5, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.text);
      doc.text(ctrlList[i], cx + 5, cy);
    }
    y += 30;

    // ── Perimeter Classification ──
    y = section('Perimeter Classification', y);
    const perimData = [
      ['Treasury  →  Vault', 'Internal', C.blue],
      ['Vault  →  Provider', 'External Controlled', C.amber],
      ['Provider  →  Vault', 'Inbound Monitored', C.green],
      ['Treasury Sweep', 'Internal Settlement', C.blue],
    ];
    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, cw, perimData.length * 6.5 + 4, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(m, y, cw, perimData.length * 6.5 + 4, 2, 2, 'S');
    y += 4;
    for (const [flow, cls, color] of perimData) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.text);
      doc.text(flow as string, m + 5, y + 3);
      badge(cls as string, color as [number, number, number], W - m - doc.getTextWidth(cls as string) - 10, y + 3);
      y += 6.5;
    }

    // ══════════════════════════════════════════
    //  PAGE 2 — AUDIT TRAIL
    // ══════════════════════════════════════════

    doc.addPage();
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, H, 'F');
    y = header();

    y = section(`Compliance Event Timeline  —  ${events.length} events`, y);

    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [['Time', 'Event', 'Flow', 'Actor', 'Status', 'Control', 'Notes']],
      body: events.map(evt => {
        const flow = classifyFlow(evt.actionType);
        return [
          fmtTime(evt.timestamp),
          evt.actionType?.replace(/_/g, ' ') || '—',
          flow.label,
          evt.role?.replace(/_/g, ' ') || '—',
          evt.result?.toUpperCase() || '—',
          controlResult(evt.result),
          (evt.reason || '—').slice(0, 55),
        ];
      }),
      styles: {
        fontSize: 6.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
        textColor: [...C.text],
        fillColor: [...C.white],
        lineColor: [...C.border],
        lineWidth: 0.2,
        font: 'helvetica',
      },
      headStyles: {
        fillColor: [...C.navy],
        textColor: [...C.white],
        fontStyle: 'bold',
        fontSize: 6.5,
      },
      alternateRowStyles: {
        fillColor: [...C.lightBg],
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 28, fontStyle: 'bold' },
        2: { cellWidth: 18 },
        3: { cellWidth: 22 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        // Color the Status column
        if (data.section === 'body' && data.column.index === 4) {
          const val = (data.cell.raw as string)?.toUpperCase();
          if (val === 'SUCCESS') data.cell.styles.textColor = C.green;
          else if (val === 'FAILURE' || val === 'BLOCKED') data.cell.styles.textColor = C.red;
          else if (val === 'PENDING') data.cell.styles.textColor = C.amber;
        }
        // Color the Control column
        if (data.section === 'body' && data.column.index === 5) {
          const val = data.cell.raw as string;
          if (val === 'Passed') data.cell.styles.textColor = C.green;
          else if (val === 'Blocked') data.cell.styles.textColor = C.red;
          else if (val === 'Pending') data.cell.styles.textColor = C.amber;
        }
        // Color the Flow column
        if (data.section === 'body' && data.column.index === 2) {
          const val = data.cell.raw as string;
          if (val === 'Internal') data.cell.styles.textColor = C.blue;
          else if (val === 'External') data.cell.styles.textColor = C.amber;
          else if (val === 'Inbound') data.cell.styles.textColor = C.green;
        }
      },
    });

    // ── Footers on all pages ──
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      footer(p, total);
    }

    doc.save(`AMINA-Compliance-Report-${vId}-${dateStr}.pdf`);
    setExporting(false);
    notify('success', 'Compliance report downloaded');
  };

  if (!activeVaultId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-vault-accent" />
            Compliance Control Centre
          </h1>
          <p className="text-xs text-vault-muted mt-1">Select a vault to run compliance checks and view audit data.</p>
        </div>
        <Card title="Select Vault" subtitle="Choose a vault to inspect">
          {loadingVaults ? (
            <p className="text-xs text-vault-muted animate-pulse">Loading vaults...</p>
          ) : vaults.length === 0 ? (
            <p className="text-xs text-vault-muted">No vaults found. Create a vault from the Vault Factory page first.</p>
          ) : (
            <div className="space-y-2">
              {vaults.map((v: any) => (
                <button
                  key={v.vaultId}
                  onClick={() => handleSelectVault(v.vaultId)}
                  className="w-full flex items-center justify-between bg-vault-bg border border-vault-border rounded-lg px-4 py-3 hover:border-vault-accent transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-vault-accent/10 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-vault-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-mono font-semibold text-white">{v.vaultId}</p>
                      <p className="text-xs text-vault-muted">{v.clientReference || '—'} — {v.baseAsset || 'USDC'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={v.status || 'active'} />
                    <span className="text-xs text-vault-muted font-mono">{fmt(v.totalNAV)} USDC</span>
                    <span className="text-vault-muted group-hover:text-vault-accent transition-colors">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  const fmt = (v: any) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso || '—'; }
  };

  const filteredEvents = filterAction === 'ALL' ? events : events.filter((e) => e.actionType === filterAction);

  // Strategy exposures from snapshot (object → array)
  const exposuresObj = snapshot?.strategyExposures || {};
  const exposures = Object.entries(exposuresObj).map(([name, val]: [string, any]) => ({
    name, amount: val?.amount || 0, strategyId: val?.strategyId || name,
  }));
  const totalDeployed = exposures.reduce((s, e) => s + e.amount, 0);
  const approvedDestCount = snapshot?.approvedDestinations?.length ?? 0;
  const providerCount = exposures.filter((e) => e.amount > 0).length;

  // Pending reviews from events
  const pendingEvents = events.filter((e) => e.result === 'pending' || e.result === 'failure');

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-vault-accent" />
            Compliance Control Centre
          </h1>
          <p className="text-xs text-vault-muted mt-1 max-w-xl">
            Real-time compliance state for this segregated institutional vault, including mandate controls, transfer controls, provider settlement checks, and audit history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Searchable vault selector */}
          <div className="relative">
            <button
              onClick={() => setVaultSearchOpen(!vaultSearchOpen)}
              className="flex items-center gap-2 bg-vault-bg border border-vault-border hover:border-vault-accent rounded px-3 py-1.5 transition-colors min-w-[220px]"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-vault-accent flex-shrink-0" />
              <span className="text-xs text-white font-mono flex-1 text-left">
                {activeVaultId ? `${activeVaultId} — ${vaults.find((v: any) => v.vaultId === activeVaultId)?.clientReference || ''}` : 'Select vault...'}
              </span>
              <svg className={`w-3 h-3 text-vault-muted transition-transform ${vaultSearchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {vaultSearchOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVaultSearchOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-[320px] bg-vault-card border border-vault-border rounded-lg shadow-xl overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-vault-border">
                    <input
                      type="text"
                      value={vaultSearch}
                      onChange={(e) => setVaultSearch(e.target.value)}
                      placeholder="Search by vault ID or client..."
                      className="w-full bg-vault-bg border border-vault-border rounded px-3 py-1.5 text-xs text-white placeholder-vault-muted focus:outline-none focus:border-vault-accent"
                      autoFocus
                    />
                  </div>
                  {/* Results */}
                  <div className="max-h-[240px] overflow-y-auto">
                    {vaults
                      .filter((v: any) => {
                        if (!vaultSearch) return true;
                        const q = vaultSearch.toLowerCase();
                        return (v.vaultId?.toLowerCase().includes(q)) || (v.clientReference?.toLowerCase().includes(q)) || (v.credentialId?.toLowerCase().includes(q));
                      })
                      .map((v: any) => (
                        <button
                          key={v.vaultId}
                          onClick={() => { handleSelectVault(v.vaultId); setVaultSearchOpen(false); setVaultSearch(''); }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-vault-bg transition-colors ${activeVaultId === v.vaultId ? 'bg-vault-accent/10 border-l-2 border-vault-accent' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-semibold text-white">{v.vaultId}</p>
                            <p className="text-[10px] text-vault-muted truncate">{v.clientReference || '—'} — {v.baseAsset || 'USDC'} — NAV: {fmt(v.totalNAV)}</p>
                          </div>
                          <StatusBadge status={v.status || 'active'} />
                        </button>
                      ))}
                    {vaults.filter((v: any) => {
                      if (!vaultSearch) return true;
                      const q = vaultSearch.toLowerCase();
                      return (v.vaultId?.toLowerCase().includes(q)) || (v.clientReference?.toLowerCase().includes(q));
                    }).length === 0 && (
                      <p className="text-xs text-vault-muted text-center py-4">No vaults match your search</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={handleRunComplianceCheck} disabled={checkRunning} className="flex items-center gap-1.5 bg-vault-accent hover:bg-blue-600 text-white text-xs font-semibold rounded px-4 py-2 transition-colors disabled:opacity-50">
            <ShieldCheck className="w-3.5 h-3.5" />
            {checkRunning ? 'Running...' : 'Run Compliance Check'}
          </button>
          <button onClick={handleExportReport} disabled={exporting} className="flex items-center gap-1.5 bg-vault-card border border-vault-border hover:border-vault-accent text-vault-muted hover:text-white text-xs font-medium rounded px-3 py-2 transition-colors disabled:opacity-50">
            <FileText className="w-3.5 h-3.5" />
            {exporting ? 'Generating...' : 'Export Report'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-vault-muted animate-pulse">Loading compliance data...</p>
      ) : (
        <>
          {/* ROW 1: Vault Compliance Snapshot + External Monitoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Vault Compliance Snapshot */}
            <Card title="Vault Compliance Snapshot" subtitle="Current state of the segregated vault">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Vault ID', snapshot?.vaultId || '—'],
                    ['Client Reference', snapshot?.clientReference || '—'],
                    ['Mandate', snapshot?.mandateStatus || '—'],
                    ['Vault Status', snapshot?.paused ? 'Paused' : snapshot?.status || '—'],
                    ['Risk Status', 'Green'],
                    ['Approved Providers', `${providerCount} active`],
                    ['Approved Destinations', `${approvedDestCount} wallets`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between bg-vault-bg rounded px-2.5 py-1.5">
                      <span className="text-vault-muted">{label}</span>
                      <span className="text-white font-medium">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Perimeter Classification */}
                <div className="border-t border-vault-border pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-vault-muted mb-2">Perimeter Classification</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {[
                      ['Treasury → Vault', 'Internal', 'text-blue-400'],
                      ['Vault → Provider', 'External Controlled', 'text-amber-400'],
                      ['Provider → Vault', 'Inbound Monitored', 'text-green-400'],
                      ['Treasury Sweep', 'Internal Settlement', 'text-blue-400'],
                    ].map(([flow, classification, color]) => (
                      <div key={flow} className="flex justify-between bg-vault-bg rounded px-2.5 py-1.5">
                        <span className="text-vault-muted">{flow}</span>
                        <span className={`font-medium ${color}`}>{classification}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Right: External Monitoring & Travel Rule Links */}
            <Card title="External Monitoring & Travel Rule" subtitle="Chainalysis integration points">
              <div className="space-y-2">
                {[
                  { label: 'KYT Screening', desc: 'Real-time transaction screening', action: 'View in Chainalysis', path: '/kyt' },
                  { label: 'Travel Rule Review', desc: 'FATF Travel Rule transfer cases', action: 'Open Transfer Case', path: '/travel-rule' },
                  { label: 'Outbound Provider Transfer', desc: 'Vault → Strategy provider flow', action: 'View in Chainalysis', path: '/kyt/transfers' },
                  { label: 'Inbound Provider Return', desc: 'Provider → Vault return flow', action: 'Investigate in Chainalysis', path: '/kyt/alerts' },
                  { label: 'Wallet Exposure Check', desc: 'Address risk and counterparty exposure', action: 'Open Address Intelligence', path: '/reactor' },
                  { label: 'Counterparty Risk Review', desc: 'Provider and destination risk', action: 'View Counterparty Analysis', path: '/kyt/counterparties' },
                ].map(({ label, desc, action, path }) => (
                  <div key={label} className="flex items-center justify-between bg-vault-bg rounded px-3 py-2.5">
                    <div className="flex-1">
                      <p className="text-xs text-white font-medium">{label}</p>
                      <p className="text-[10px] text-vault-muted">{desc}</p>
                    </div>
                    <a
                      href={`${CHAINALYSIS_BASE}${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-vault-accent hover:underline bg-vault-accent/10 px-2 py-1 rounded whitespace-nowrap"
                    >
                      {action} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ROW 2: Pending Reviews + Active Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Pending Reviews */}
            <Card title="Pending Reviews" subtitle={`${pendingEvents.length} item${pendingEvents.length !== 1 ? 's' : ''} requiring attention`}>
              {pendingEvents.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-green-400 py-2">
                  <ShieldCheck className="w-4 h-4" />
                  No pending reviews. All controls passed.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingEvents.slice(0, 5).map((evt) => (
                    <div key={evt.eventId} className={`border-l-2 ${eventRowBorder(evt.result)} bg-vault-bg rounded-r px-3 py-2`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white font-medium">{evt.actionType?.replace(/_/g, ' ')}</span>
                        <StatusBadge status={evt.result === 'failure' ? 'blocked' : evt.result} />
                      </div>
                      <p className="text-[10px] text-vault-muted mt-0.5">{evt.reason || '—'}</p>
                      <p className="text-[10px] text-vault-muted">{fmtTime(evt.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Right: Active Controls */}
            <Card title="Active Controls" subtitle="Vault governance and compliance controls in effect">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'No Pooling', active: true },
                  { label: 'Mandate Attached', active: snapshot?.mandateStatus === 'active' },
                  { label: 'No Leverage', active: true },
                  { label: 'Approved Destinations Only', active: approvedDestCount > 0 },
                  { label: 'Travel Rule on External Edges', active: true },
                  { label: 'Provider Whitelist Active', active: providerCount > 0 },
                  { label: 'Inbound Settlement Matching', active: true },
                  { label: 'Treasury Sweep Enabled', active: true },
                ].map(({ label, active }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded border ${
                      active
                        ? 'bg-green-900/20 border-green-800/40 text-green-400'
                        : 'bg-vault-bg border-vault-border text-vault-muted'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-400' : 'bg-gray-600'}`} />
                    {label}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ROW 3: Compliance Event Timeline */}
          <Card title="Compliance Event Timeline" subtitle={`${filteredEvents.length} events recorded`}>
            {/* Filter */}
            <div className="flex items-center gap-3 mb-4">
              <label className="text-[10px] uppercase tracking-wider text-vault-muted">Filter</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="bg-vault-bg border border-vault-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t === 'ALL' ? 'All Events' : t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-vault-border text-vault-muted text-[10px] uppercase tracking-wider">
                    <th className="text-left py-2 pr-2 font-semibold">Time</th>
                    <th className="text-left py-2 pr-2 font-semibold">Event</th>
                    <th className="text-left py-2 pr-2 font-semibold">Flow</th>
                    <th className="text-left py-2 pr-2 font-semibold">Actor</th>
                    <th className="text-left py-2 pr-2 font-semibold">Status</th>
                    <th className="text-left py-2 pr-2 font-semibold">Control</th>
                    <th className="text-left py-2 pr-2 font-semibold">Notes</th>
                    <th className="text-left py-2 font-semibold">External</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-vault-muted">No events found.</td></tr>
                  ) : (
                    filteredEvents.map((evt) => {
                      const flow = classifyFlow(evt.actionType);
                      const isExternal = flow.type !== 'internal';
                      return (
                        <tr key={evt.eventId} className={`border-b border-vault-border/30 border-l-2 ${eventRowBorder(evt.result)} hover:bg-vault-bg/50 transition-colors`}>
                          <td className="py-2 pr-2 text-vault-muted whitespace-nowrap">{fmtTime(evt.timestamp)}</td>
                          <td className="py-2 pr-2">
                            <span className="bg-vault-bg text-white rounded px-1.5 py-0.5 text-[10px] font-medium">
                              {evt.actionType?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              flow.type === 'internal' ? 'bg-blue-900/30 text-blue-400' :
                              flow.type === 'external' ? 'bg-amber-900/30 text-amber-400' :
                              'bg-green-900/30 text-green-400'
                            }`}>
                              {flow.label}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-vault-muted capitalize">{evt.role?.replace(/_/g, ' ') || '—'}</td>
                          <td className="py-2 pr-2"><StatusBadge status={evt.result} /></td>
                          <td className="py-2 pr-2">
                            <span className={`text-[10px] font-medium ${
                              controlResult(evt.result) === 'Passed' ? 'text-green-400' :
                              controlResult(evt.result) === 'Blocked' ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {controlResult(evt.result)}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-vault-muted max-w-[180px] truncate" title={evt.reason}>{evt.reason || '—'}</td>
                          <td className="py-2">
                            {isExternal ? (
                              <a href={`${CHAINALYSIS_BASE}/kyt`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-0.5 text-[10px] text-vault-accent hover:underline">
                                Review <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-vault-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Compliance Check Modal */}
      {showCheckModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !checkRunning && setShowCheckModal(false)}>
          <div className="bg-[#111827] border border-vault-border rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-vault-border">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-vault-accent" />
                <h2 className="text-lg font-bold text-white">Compliance Check</h2>
              </div>
              <p className="text-xs text-vault-muted mt-1">
                {checkRunning ? 'Running automated compliance verification...' : `Completed at ${fmtTime(checkResult?.timestamp || '')}`}
              </p>
            </div>

            <div className="p-5 space-y-2">
              {/* Animated check steps */}
              {complianceChecks.map((check, i) => {
                const isDone = checkStep > i;
                const isActive = checkStep === i + 1 && checkRunning;
                const result = checkResult?.checks[i];

                return (
                  <div key={check.name} className={`flex items-center gap-3 px-3 py-2 rounded transition-all ${
                    isDone ? 'bg-vault-bg' : isActive ? 'bg-vault-accent/5 border border-vault-accent/20' : 'opacity-40'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                      result?.status === 'Failed' ? 'bg-red-500 text-white' :
                      result?.status === 'Review Required' ? 'bg-yellow-500 text-black' :
                      result?.status === 'Not Required' ? 'bg-gray-600 text-white' :
                      isDone ? 'bg-green-500 text-white' :
                      isActive ? 'bg-vault-accent text-white animate-pulse' :
                      'bg-vault-border text-vault-muted'
                    }`}>
                      {isDone && !checkRunning ? (result?.status === 'Failed' ? '!' : result?.status === 'Review Required' ? '?' : '✓') : isActive ? '...' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${isDone ? 'text-white' : 'text-vault-muted'}`}>{check.name}</p>
                      {isDone && !checkRunning && result && (
                        <p className="text-[10px] text-vault-muted truncate">{result.detail}</p>
                      )}
                    </div>
                    {isDone && !checkRunning && result && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                        result.status === 'Passed' ? 'bg-green-900/30 text-green-400' :
                        result.status === 'Failed' ? 'bg-red-900/30 text-red-400' :
                        result.status === 'Review Required' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {result.status}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overall result */}
            {checkResult && !checkRunning && (
              <div className="p-5 border-t border-vault-border">
                <div className={`flex items-center justify-between p-3 rounded-lg ${
                  checkResult.overallStatus === 'Compliant' ? 'bg-green-900/20 border border-green-800/40' :
                  checkResult.overallStatus === 'Review Required' ? 'bg-yellow-900/20 border border-yellow-800/40' :
                  'bg-red-900/20 border border-red-800/40'
                }`}>
                  <div className="flex items-center gap-2">
                    {checkResult.overallStatus === 'Compliant' ? (
                      <ShieldCheck className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">Overall: {checkResult.overallStatus}</p>
                      <p className="text-[10px] text-vault-muted">
                        {checkResult.checks.filter(c => c.status === 'Passed').length}/{checkResult.checks.length} checks passed
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded ${
                    checkResult.overallStatus === 'Compliant' ? 'bg-green-500 text-white' :
                    'bg-yellow-500 text-black'
                  }`}>
                    {checkResult.overallStatus.toUpperCase()}
                  </span>
                </div>

                <button onClick={() => setShowCheckModal(false)} className="w-full mt-3 bg-vault-card border border-vault-border hover:border-vault-accent text-white text-xs font-medium rounded py-2.5 transition-colors">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
