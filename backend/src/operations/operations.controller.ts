import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OperationsService } from './operations.service';

@ApiTags('Operations')
@Controller('api/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('status')
  getStatus() {
    return this.operations.getSystemStatus();
  }

  @Get('sla')
  getSLA() {
    return this.operations.getSLAMetrics();
  }

  @Get('alerts')
  getAlerts() {
    return this.operations.getAlerts();
  }
}
