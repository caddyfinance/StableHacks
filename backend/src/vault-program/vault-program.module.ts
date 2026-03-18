import { Global, Module } from '@nestjs/common';
import { VaultProgramService } from './vault-program.service';

@Global()
@Module({
  providers: [VaultProgramService],
  exports: [VaultProgramService],
})
export class VaultProgramModule {}
