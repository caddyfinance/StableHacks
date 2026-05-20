import { Module, Global } from '@nestjs/common';
import { ComplianceLayerService } from './compliance-layer.service';
import { ComplianceLayerController } from './compliance-layer.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ComplianceLayerController],
  providers: [ComplianceLayerService],
  exports: [ComplianceLayerService],
})
export class ComplianceLayerModule {}
