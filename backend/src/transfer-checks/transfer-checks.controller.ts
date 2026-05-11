import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import { TransferChecksService } from './transfer-checks.service';
import { Roles } from '../auth/roles.guard';

@Controller('transfers')
export class TransferChecksController {
  constructor(@Inject(TransferChecksService) private readonly transferChecks: TransferChecksService) {}

  @Get('checks')
  @Roles('admin', 'compliance_officer', 'portfolio_manager')
  findAll(
    @Query('vaultId') vaultId?: string,
    @Query('transferType') transferType?: string,
    @Query('overallStatus') overallStatus?: string,
    @Query('kytStatus') kytStatus?: string,
    @Query('search') search?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transferChecks.findAll({
      vaultId,
      transferType,
      overallStatus,
      kytStatus,
      search,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('checks/:transferId')
  @Roles('admin', 'compliance_officer', 'portfolio_manager')
  findByTransfer(@Param('transferId') transferId: string) {
    return this.transferChecks.findByTransfer(transferId);
  }
}
