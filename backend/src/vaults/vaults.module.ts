import { Module } from '@nestjs/common';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';

@Module({
  providers: [VaultsService],
  controllers: [VaultsController],
})
export class VaultsModule {}
