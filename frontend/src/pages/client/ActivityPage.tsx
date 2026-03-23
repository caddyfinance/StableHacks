import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import NotVerified from '../../components/NotVerified';
import { ExternalLink, RefreshCw, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VaultEvent {
  eventId: string;
  vaultId?: string;
  actionType: string;
  actor: string;
  role: string;
  asset?: string;
  amount?: number;
  result: string;
  reason: string;
  timestamp: string;
  createdAt: string;
  txSignature?: string;
  onChainAddress?: string;
}

const ACTION_FILTERS = [
  { value: 'ALL', label: 'All Events' },
  { value: 'ONRAMP_COMPLETED', label: 'On-Ramp' },
  { value: 'OFFRAMP_REQUESTED', label: 'Off-Ramp' },
  { value: 'DEPOSIT_RECORDED', label: 'Deposits' },
  { value: 'WITHDRAWAL_REQUESTED', label: 'Withdrawals' },
  { value: 'REDEMPTION_EXECUTED', label: 'Redemptions' },
  { value: 'ALLOCATION_EXECUTED', label: 'Allocations' },
  { value: 'VAULT_CREATED', label: 'Vault Created' },
  { value: 'CREDENTIAL_ISSUED', label: 'Credentials' },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function resultBadge(result: string) {
  const r = result?.toLowerCase();
  if (r === 'success' || r === 'approved')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success-100 text-success-700">Success</span>;
  if (r === 'failure' || r === 'failed' || r === 'rejected' || r === 'blocked')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-error-100 text-error-700">Failed</span>;
  if (r === 'pending')
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning-100 text-warning-700">Pending</span>;
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">{result}</span>;
}

function actionLabel(actionType: string): string {
  return (actionType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const fmt = (v: number) => v != null && !isNaN(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const truncate = (s: string, len = 14) => s && s.length > len ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;

export default function ActivityPage() {
  const { activeVaultId, setActiveVaultId, notify, clientInfo } = useStore();

  if (!clientInfo?.credentialId) return <NotVerified />;

  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('ALL');
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const wallet = clientInfo?.walletAddress;
      const [vaultData, allEvents] = await Promise.all([
        wallet ? api.getVaultsByWallet(wallet) : api.getVaults(),
        api.getEvents(),
      ]);
      setVaults(vaultData);

      const depositTxLookup: Record<string, string> = {};
      await Promise.all(vaultData.map(async (v: any) => {
        try {
          const deps = await api.getDeposits(v.vaultId);
          for (const dep of deps) {
            if (dep.sourceType === 'On-Chain USDC Transfer' && dep.sourceReference) {
              depositTxLookup[`${v.vaultId}:${dep.amount}`] = dep.sourceReference;
            }
          }
        } catch { /* ignore */ }
      }));

      const userVaultIds = new Set(vaultData.map((v: any) => v.vaultId));
      const userEvents = allEvents
        .filter((e: VaultEvent) => !e.vaultId || userVaultIds.has(e.vaultId))
        .map((e: VaultEvent) => {
          if (e.actionType === 'DEPOSIT_RECORDED' && !e.txSignature && e.vaultId && e.amount) {
            const txSig = depositTxLookup[`${e.vaultId}:${e.amount}`];
            if (txSig) return { ...e, txSignature: txSig };
          }
          return e;
        });
      setEvents(userEvents);

      if (!activeVaultId && vaultData.length > 0) {
        setActiveVaultId(vaultData[0].vaultId);
      }
    } catch {
      notify('error', 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = filterAction === 'ALL' ? events : events.filter(e => e.actionType === filterAction);

  // ─── PDF Export ──────────────────────────────────────────────
  const handleExportPDF = () => {
    setExporting(true);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'medium' });
    const clientRef = clientInfo?.clientReference || '—';

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const m = 16;

    const C = {
      navy: [15, 23, 42] as [number, number, number],
      teal: [13, 99, 107] as [number, number, number],
      white: [255, 255, 255] as [number, number, number],
      text: [51, 65, 85] as [number, number, number],
      muted: [148, 163, 184] as [number, number, number],
      green: [22, 163, 74] as [number, number, number],
      red: [220, 38, 38] as [number, number, number],
      amber: [217, 119, 6] as [number, number, number],
      bg: [245, 247, 250] as [number, number, number],
      lightBg: [241, 245, 249] as [number, number, number],
      border: [226, 232, 240] as [number, number, number],
    };

    // ── Header ──
    const drawHeader = () => {
      doc.setFillColor(...C.navy);
      doc.rect(0, 0, W, 20, 'F');
      doc.setFillColor(...C.teal);
      doc.rect(0, 20, W, 0.8, 'F');

      doc.setFillColor(...C.teal);
      doc.roundedRect(m, 5, 10, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.white);
      doc.text('A', m + 3.5, 12);

      doc.setFontSize(11);
      doc.text('AMINA', m + 14, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(180, 190, 210);
      doc.text('Client Activity Report', m + 14, 15);

      doc.setFontSize(6.5);
      doc.setTextColor(...C.muted);
      doc.text(`${clientRef}  |  ${dateStr}`, W - m, 12, { align: 'right' });

      return 26;
    };

    const drawFooter = (pg: number, total: number) => {
      const fy = H - 10;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(m, fy, W - m, fy);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text('CONFIDENTIAL — Client Use Only', m, fy + 4);
      doc.text(timeStr, W / 2, fy + 4, { align: 'center' });
      doc.text(`Page ${pg} of ${total}`, W - m, fy + 4, { align: 'right' });
    };

    // ── Page 1: Title + Summary ──
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, H, 'F');
    let y = drawHeader();

    // Title card
    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, W - m * 2, 24, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(m, y, W - m * 2, 24, 2, 2, 'S');
    doc.setFillColor(...C.teal);
    doc.roundedRect(m, y, 3, 24, 2, 0, 'F');
    doc.rect(m + 1.5, y, 1.5, 24, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...C.navy);
    doc.text('Activity Log Report', m + 8, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    doc.text(`Client: ${clientRef}  —  Generated: ${timeStr}`, m + 8, y + 17);
    y += 30;

    // Summary stats
    const successCount = filtered.filter(e => e.result === 'success').length;
    const failedCount = filtered.filter(e => e.result === 'failure' || e.result === 'blocked').length;
    const pendingCount = filtered.filter(e => e.result === 'pending').length;
    const totalInbound = filtered.filter(e => e.actionType?.includes('DEPOSIT') || e.actionType?.includes('ONRAMP')).reduce((s, e) => s + (e.amount || 0), 0);
    const totalOutbound = filtered.filter(e => e.actionType?.includes('REDEMPTION') || e.actionType?.includes('OFFRAMP') || e.actionType?.includes('WITHDRAWAL')).reduce((s, e) => s + (e.amount || 0), 0);

    doc.setFillColor(...C.white);
    doc.roundedRect(m, y, W - m * 2, 18, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.roundedRect(m, y, W - m * 2, 18, 2, 2, 'S');
    y += 4;

    const stats = [
      [`Total Events: ${filtered.length}`, C.navy],
      [`Success: ${successCount}`, C.green],
      [`Failed: ${failedCount}`, C.red],
      [`Pending: ${pendingCount}`, C.amber],
      [`Inbound: ${fmt(totalInbound)} USDC`, C.green],
      [`Outbound: ${fmt(totalOutbound)} USDC`, C.amber],
    ];
    const colW = (W - m * 2 - 10) / 3;
    stats.forEach(([label, color], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...(color as [number, number, number]));
      doc.text(label as string, m + 5 + col * colW, y + 3 + row * 6);
    });
    y += 20;

    // ── Event Table ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.navy);
    doc.text(`Event Timeline — ${filtered.length} events`, m, y + 4);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [['Date', 'Event', 'Amount', 'Status', 'Explorer Link', 'Details']],
      body: filtered.map(evt => {
        const amountStr = evt.amount ? `${fmt(evt.amount)} ${evt.asset || 'USDC'}` : '—';
        let explorerLink = '';
        if (evt.txSignature) {
          explorerLink = `https://solscan.io/tx/${evt.txSignature}?cluster=devnet`;
        } else if (evt.onChainAddress) {
          explorerLink = `https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`;
        }
        return [
          formatTimestamp(evt.timestamp ?? evt.createdAt),
          actionLabel(evt.actionType),
          amountStr,
          (evt.result || '—').toUpperCase(),
          explorerLink || '—',
          (evt.reason || '—').slice(0, 60),
        ];
      }),
      styles: {
        fontSize: 6,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
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
        fontSize: 6,
      },
      alternateRowStyles: {
        fillColor: [...C.lightBg],
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 28, fontStyle: 'bold' },
        2: { cellWidth: 22 },
        3: { cellWidth: 14 },
        4: { cellWidth: 50, textColor: [...C.teal], fontSize: 5 },
        5: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        // Color the Status column
        if (data.section === 'body' && data.column.index === 3) {
          const val = (data.cell.raw as string)?.toUpperCase();
          if (val === 'SUCCESS') data.cell.styles.textColor = C.green;
          else if (val === 'FAILURE' || val === 'BLOCKED') data.cell.styles.textColor = C.red;
          else if (val === 'PENDING') data.cell.styles.textColor = C.amber;
        }
        // Make explorer links teal
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw !== '—') {
          data.cell.styles.textColor = C.teal;
        }
      },
      didDrawCell: (data: any) => {
        // Add clickable links for explorer URLs
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw && data.cell.raw !== '—') {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw });
        }
      },
    });

    // ── Explorer Links Index (last page) ──
    const eventsWithLinks = filtered.filter(e => e.txSignature || e.onChainAddress);
    if (eventsWithLinks.length > 0) {
      doc.addPage();
      doc.setFillColor(...C.bg);
      doc.rect(0, 0, W, H, 'F');
      y = drawHeader();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.navy);
      doc.text('Solana Explorer Links', m, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.text('Click any link below to view the transaction or account on Solana Explorer', m, y + 10);
      y += 16;

      autoTable(doc, {
        startY: y,
        margin: { left: m, right: m },
        head: [['Date', 'Event', 'Type', 'Explorer URL']],
        body: eventsWithLinks.map(evt => {
          const isTx = !!evt.txSignature;
          const url = isTx
            ? `https://solscan.io/tx/${evt.txSignature}?cluster=devnet`
            : `https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`;
          return [
            formatTimestamp(evt.timestamp ?? evt.createdAt),
            actionLabel(evt.actionType),
            isTx ? 'Transaction' : 'Account',
            url,
          ];
        }),
        styles: {
          fontSize: 6,
          cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          textColor: [...C.text],
          fillColor: [...C.white],
          lineColor: [...C.border],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [...C.navy],
          textColor: [...C.white],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 30 },
          2: { cellWidth: 20 },
          3: { cellWidth: 'auto', textColor: [...C.teal], fontSize: 5.5 },
        },
        didDrawCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 3 && data.cell.raw) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: data.cell.raw });
          }
        },
      });
    }

    // ── Footers ──
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      drawFooter(p, total);
    }

    doc.save(`AMINA-Activity-Log-${clientRef}-${dateStr}.pdf`);
    setExporting(false);
    notify('success', `Exported ${filtered.length} events to PDF`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display text-ink-900">Activity Log</h1>
          <p className="text-sm text-slate-500 mt-1">Complete audit trail of vault operations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-700 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleExportPDF} disabled={exporting || filtered.length === 0}
            className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-[12px] px-4 py-2 transition-colors disabled:opacity-50 shadow-1">
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Generating...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <Card title="Transaction History" subtitle={`${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="px-3 py-1.5 rounded-[12px] bg-white border border-slate-200 text-ink-900 text-xs focus:outline-none focus:ring-teal-600/20 focus:border-teal-600 transition-colors">
            {ACTION_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500 animate-pulse py-4">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No events found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Date</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Action</th>
                  <th className="text-right py-2.5 pr-3 font-semibold border-b border-slate-200">Amount</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Status</th>
                  <th className="text-left py-2.5 pr-3 font-semibold border-b border-slate-200">Explorer</th>
                  <th className="text-left py-2.5 font-semibold border-b border-slate-200">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt, i) => (
                  <tr key={evt.eventId} className={`hover:bg-teal-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-200/60' : ''}`}>
                    <td className="py-3 pr-3 text-slate-500 whitespace-nowrap align-top">
                      {formatTimestamp(evt.timestamp ?? evt.createdAt)}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <span className="text-ink-900 font-medium">{actionLabel(evt.actionType)}</span>
                      {evt.vaultId && vaults.length > 1 && (
                        <span className="text-slate-500 font-mono ml-1.5">{evt.vaultId}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono align-top">
                      {evt.amount != null && evt.amount > 0 ? (
                        <span className={evt.actionType?.includes('REDEMPTION') ? 'text-warning-700' : 'text-ink-900'}>
                          {evt.actionType?.includes('REDEMPTION') ? '-' : '+'}{fmt(evt.amount)}
                          {evt.asset ? <span className="text-slate-500 ml-1">{evt.asset}</span> : null}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {resultBadge(evt.result)}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      {evt.txSignature ? (
                        <a href={`https://solscan.io/tx/${evt.txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:underline font-mono">
                          Tx {truncate(evt.txSignature)} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      ) : evt.onChainAddress && (evt.actionType === 'VAULT_CREATED' || evt.actionType === 'CREDENTIAL_ISSUED') ? (
                        <a href={`https://solscan.io/account/${evt.onChainAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-review-700 hover:underline font-mono">
                          Acc {truncate(evt.onChainAddress)} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                        </a>
                      ) : null}
                    </td>
                    <td className="py-3 text-slate-500 max-w-[240px] align-top">
                      <span className="line-clamp-2">{evt.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
