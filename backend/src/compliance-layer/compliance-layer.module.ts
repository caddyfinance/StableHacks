import { Module, Global } from '@nestjs/common';
import { ComplianceLayerService } from './compliance-layer.service';
import { ComplianceLayerController } from './compliance-layer.controller';

/**
 * Global NestJS module for reading on-chain compliance data.
 * Exports ComplianceLayerService for use across the application.
 */
@Global()
@Module({
  controllers: [ComplianceLayerController],
  providers: [ComplianceLayerService],
  exports: [ComplianceLayerService],
})
export class ComplianceLayerModule {}
