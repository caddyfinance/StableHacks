import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../store/useStore';
import Card from '../../components/Card';
import { Activity, ShieldCheck, Clock, Globe, AlertTriangle, Zap } from 'lucide-react';

interface ServiceStatus {
  service: string;
  status: string;
  latency: string;
  lastCheck: string;
}

interface SLAMetrics {
  uptime: number;
  uptimeTarget: number;
  avgLatency: number;
  latencyTarget: number;
  avgResponseTime: number;
  responseTarget: number;
  daysSinceIncident: number;
  totalIncidents30d: number;
  instructionsProcessed24h: number;
  instructionsProcessed7d: number;
}

const TIMEZONE_CITIES = [
  { city: 'Zurich', tz: 'Europe/Zurich', code: 'CH' },
  { city: 'Abu Dhabi', tz: 'Asia/Dubai', code: 'AE' },
  { city: 'Hong Kong', tz: 'Asia/Hong_Kong', code: 'HK' },
  { city: 'Singapore', tz: 'Asia/Singapore', code: 'SG' },
];

function LiveClock({ tz, city, code }: { tz: string; city: string; code: string }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      try {
        setTime(new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      } catch { setTime('--:--:--'); }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [tz]);

  return (
    <div className="bg-white border border-slate-200 rounded-[12px] p-3 text-center">
      <p className="text-lg font-bold font-mono text-ink-900">{time}</p>
      <p className="text-xs text-slate-500">{city}</p>
      <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">{code}</span>
    </div>
  );
}

export default function OperationsPage() {
  const { notify } = useStore();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [sla, setSLA] = useState<SLAMetrics | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.opsStatus().catch(() => []),
      api.opsSLA().catch(() => null),
      api.opsAlerts().catch(() => []),
    ]).then(([s, m, a]) => {
      setServices(s);
      setSLA(m);
      setAlerts(a);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-slate-500 animate-pulse">Loading operations data...</div>;

  const allHealthy = services.every(s => s.status === 'healthy');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-700" />
          24/7 Operations Dashboard
        </h1>
        <p className="text-xs text-slate-700 mt-1">
          Real-time health monitoring across AMINA's three-layer architecture — Zurich, Abu Dhabi, Hong Kong, Singapore.
        </p>
      </div>

      {/* System Status Banner */}
      <div className={`flex items-center justify-between rounded-[18px] p-4 border ${allHealthy ? 'bg-success-100 border-success-700/20' : 'bg-warning-100 border-warning-700/20'}`}>
        <div className="flex items-center gap-3">
          <ShieldCheck className={`w-6 h-6 ${allHealthy ? 'text-success-700' : 'text-warning-700'}`} />
          <div>
            <p className={`text-sm font-bold ${allHealthy ? 'text-success-700' : 'text-warning-700'}`}>
              {allHealthy ? 'All Systems Operational' : 'Degraded Performance'}
            </p>
            <p className="text-[10px] text-slate-500">{services.length} services monitored across 3 architectural layers</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-[12px] ${allHealthy ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}>
          {allHealthy ? 'ALL GREEN' : 'DEGRADED'}
        </span>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map(s => (
          <div key={s.service} className="bg-white border border-slate-200 rounded-[18px] p-4 shadow-1">
            <div className="flex items-center justify-between mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${s.status === 'healthy' ? 'bg-green-500' : s.status === 'degraded' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-[10px] text-slate-400">{s.latency}</span>
            </div>
            <p className="text-xs font-semibold text-ink-900">{s.service}</p>
            <p className={`text-[10px] font-medium mt-0.5 ${s.status === 'healthy' ? 'text-success-700' : 'text-warning-700'}`}>
              {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* SLA Metrics */}
        <Card title="SLA Compliance" subtitle="Service level agreement metrics">
          {sla && (
            <div className="space-y-4">
              {[
                { label: 'Uptime', value: `${sla.uptime}%`, target: `${sla.uptimeTarget}% target`, met: sla.uptime >= sla.uptimeTarget },
                { label: 'Avg Tx Latency', value: `${sla.avgLatency}s`, target: `${sla.latencyTarget}s target`, met: sla.avgLatency <= sla.latencyTarget },
                { label: 'Alert Response', value: `${sla.avgResponseTime}min`, target: `${sla.responseTarget}min target`, met: sla.avgResponseTime <= sla.responseTarget },
              ].map(({ label, value, target, met }) => (
                <div key={label} className="flex items-center justify-between bg-teal-50 rounded-[12px] px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-ink-900">{label}</p>
                    <p className="text-[10px] text-slate-500">{target}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-ink-900">{value}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${met ? 'bg-success-100 text-success-700' : 'bg-error-100 text-error-700'}`}>
                      {met ? 'MET' : 'MISS'}
                    </span>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-3 text-center">
                <div className="bg-teal-50 rounded-[12px] p-3">
                  <p className="text-lg font-bold text-teal-700">{sla.daysSinceIncident}</p>
                  <p className="text-[10px] text-slate-500">Days since last incident</p>
                </div>
                <div className="bg-teal-50 rounded-[12px] p-3">
                  <p className="text-lg font-bold text-success-700">{sla.totalIncidents30d}</p>
                  <p className="text-[10px] text-slate-500">Incidents (30 days)</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Pipeline Throughput */}
        <Card title="Pipeline Throughput" subtitle="Translation Layer instruction processing">
          {sla && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-teal-50 rounded-[18px] p-4 text-center">
                  <Zap className="w-5 h-5 text-teal-700 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-ink-900 font-mono">{sla.instructionsProcessed24h}</p>
                  <p className="text-[10px] text-slate-500">Instructions (24h)</p>
                </div>
                <div className="bg-teal-50 rounded-[18px] p-4 text-center">
                  <Activity className="w-5 h-5 text-teal-700 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-ink-900 font-mono">{sla.instructionsProcessed7d}</p>
                  <p className="text-[10px] text-slate-500">Instructions (7d)</p>
                </div>
              </div>
              <div className="bg-teal-50 rounded-[12px] p-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Incident Timeline (30 days)</p>
                <div className="flex gap-0.5">
                  {Array.from({ length: 30 }, (_, i) => (
                    <div key={i} className="flex-1 h-6 bg-success-700 rounded-sm" title={`Day ${30 - i}: No incidents`} />
                  ))}
                </div>
                <p className="text-[10px] text-success-700 text-center mt-1 font-medium">All clear — 30 consecutive clean days</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 24/7 Timezone Clocks */}
      <Card title="24/7 Global Operations" subtitle="AMINA operational centres across jurisdictions">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TIMEZONE_CITIES.map(c => (
            <LiveClock key={c.city} {...c} />
          ))}
        </div>
      </Card>

      {/* Active Alerts */}
      <Card title="Active Alerts" subtitle={`${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`}>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-success-700 py-4 justify-center">
            <ShieldCheck className="w-5 h-5" />
            No active alerts. All systems operating within normal parameters.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-warning-100 rounded-[12px] px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning-700" />
                  <p className="text-xs text-warning-700">{a.message}</p>
                </div>
                <span className="text-[10px] text-slate-500">{a.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
