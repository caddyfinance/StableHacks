import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletControllersController } from './wallet-controllers.controller';
import { WalletControllersService } from './wallet-controllers.service';

@Module({
  imports: [PrismaModule],
  controllers: [WalletControllersController],
  providers: [WalletControllersService],
  exports: [WalletControllersService],
})
export class WalletControllersModule {}
