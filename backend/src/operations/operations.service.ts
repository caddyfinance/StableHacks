import { Injectable } from '@nestjs/common';

@Injectable()
export class OperationsService {
  getSystemStatus() {
    return [
      { service: 'Solana RPC', status: 'healthy', latency: '142ms', lastCheck: new Date().toISOString() },
      { service: 'Translation Layer', status: 'healthy', latency: '89ms', lastCheck: new Date().toISOString() },
      { service: 'Finstar (Core Banking)', status: 'healthy', latency: '210ms', lastCheck: new Date().toISOString() },
      { service: 'Notabene (Travel Rule)', status: 'healthy', latency: '156ms', lastCheck: new Date().toISOString() },
      { service: 'Mesh (Venue Connectivity)', status: 'healthy', latency: '134ms', lastCheck: new Date().toISOString() },
      { service: 'Jurisdiction Engine', status: 'healthy', latency: '78ms', lastCheck: new Date().toISOString() },
      { service: 'Database (PostgreSQL)', status: 'healthy', latency: '12ms', lastCheck: new Date().toISOString() },
      { service: 'Solstice Protocol', status: 'healthy', latency: '198ms', lastCheck: new Date().toISOString() },
    ];
  }

  getSLAMetrics() {
    return {
      uptime: 99.97,
      uptimeTarget: 99.9,
      avgLatency: 1.2,
      latencyTarget: 2.0,
      avgResponseTime: 1.8,
      responseTarget: 5.0,
      daysSinceIncident: 47,
      totalIncidents30d: 0,
      instructionsProcessed24h: 127,
      instructionsProcessed7d: 843,
    };
  }

  getAlerts() {
    return [];
  }
}
