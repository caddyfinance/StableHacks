import { Module } from '@nestjs/common';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';
import { TransferChecksModule } from '../transfer-checks/transfer-checks.module';
import { WalletControllersModule } from '../wallet-controllers/wallet-controllers.module';

@Module({
  imports: [TransferChecksModule, WalletControllersModule],
  providers: [VaultsService],
  controllers: [VaultsController],
})
export class VaultsModule {}
