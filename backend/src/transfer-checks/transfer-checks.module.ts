import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletControllersModule } from '../wallet-controllers/wallet-controllers.module';
import { TransferChecksController } from './transfer-checks.controller';
import { TransferChecksService } from './transfer-checks.service';

@Module({
  imports: [PrismaModule, WalletControllersModule],
  controllers: [TransferChecksController],
  providers: [TransferChecksService],
  exports: [TransferChecksService],
})
export class TransferChecksModule {}
