import { Module } from '@nestjs/common';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';
import { TransferChecksModule } from '../transfer-checks/transfer-checks.module';

@Module({
  imports: [TransferChecksModule],
  providers: [VaultsService],
  controllers: [VaultsController],
})
export class VaultsModule {}
