import { Module, Global } from '@nestjs/common';
import { FinstarService } from './finstar.service';
import { FinstarController } from './finstar.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [PrismaModule, EventsModule],
  providers: [FinstarService],
  controllers: [FinstarController],
  exports: [FinstarService],
})
export class FinstarModule {}
