import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CredentialsController } from './credentials.controller';
import { WalletControllersModule } from '../wallet-controllers/wallet-controllers.module';

@Module({
  imports: [WalletControllersModule],
  providers: [CredentialsService],
  controllers: [CredentialsController],
})
export class CredentialsModule {}
