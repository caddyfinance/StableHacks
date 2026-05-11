import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import { TransferChecksService } from './transfer-checks.service';

@Controller('transfers')
export class TransferChecksController {
  constructor(@Inject(TransferChecksService) private readonly transferChecks: TransferChecksService) {}

  @Get('checks')
  findAll(
    @Query('vaultId') vaultId?: string,
    @Query('transferType') transferType?: string,
    @Query('overallStatus') overallStatus?: string,
  ) {
    return this.transferChecks.findAll({ vaultId, transferType, overallStatus });
  }

  @Get('checks/:transferId')
  findByTransfer(@Param('transferId') transferId: string) {
    return this.transferChecks.findByTransfer(transferId);
  }
}
