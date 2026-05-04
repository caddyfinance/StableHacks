import { Module, Global } from '@nestjs/common';
import { FinstarService } from './finstar.service';
import { FinstarController } from './finstar.controller';

@Global()
@Module({
  providers: [FinstarService],
  controllers: [FinstarController],
  exports: [FinstarService],
})
export class FinstarModule {}
