import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { Roles } from '../auth/roles.guard';

@ApiTags('Operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('status')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Get system health status', description: 'Returns health status of all connected services (RPC, Translation Layer, Finstar, Notabene, Mesh, etc.).' })
  @ApiOkResponse({ description: 'Returns array of service health statuses.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin or compliance officer role required.' })
  getStatus() {
    return this.operations.getSystemStatus();
  }

  @Get('sla')
  @Roles('admin', 'compliance_officer')
  @ApiOperation({ summary: 'Get SLA metrics', description: 'Returns SLA compliance metrics including uptime, latency, and incident counts.' })
  @ApiOkResponse({ description: 'Returns SLA metrics object.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions. Admin or compliance officer role required.' })
  getSLA() {
    return this.operations.getSLAMetrics();
  }

  @Get('alerts')
  @Roles('admin', 'compliance_officer', 'emergency_admin')
  @ApiOperation({ summary: 'Get active alerts', description: 'Returns currently active system alerts and warnings.' })
  @ApiOkResponse({ description: 'Returns array of active alerts.' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
  getAlerts() {
    return this.operations.getAlerts();
  }
}
