import { Global, Module } from '@nestjs/common';
import { SasService } from './sas.service';

@Global()
@Module({
  providers: [SasService],
  exports: [SasService],
})
export class SasModule {}
