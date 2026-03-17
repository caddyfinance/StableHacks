import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { MockEntraService } from './mock-entra.service';

@Module({
  providers: [AdminAuthService, MockEntraService],
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
