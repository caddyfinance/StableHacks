import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('compliance/:vaultId')
  getComplianceReport(@Param('vaultId') vaultId: string) {
    return this.reports.getComplianceReport(vaultId);
  }
}
