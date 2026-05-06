import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CredentialsModule } from './credentials/credentials.module';
import { VaultsModule } from './vaults/vaults.module';
import { StrategiesModule } from './strategies/strategies.module';
import { ConsentModule } from './consent/consent.module';
import { EventsModule } from './events/events.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { SasModule } from './sas/sas.module';
import { VaultProgramModule } from './vault-program/vault-program.module';
import { SolsticeModule } from './solstice/solstice.module';
import { HealthModule } from './health/health.module';
import { TranslationLayerModule } from './translation-layer/translation-layer.module';
import { FinstarModule } from './finstar/finstar.module';
import { ComplianceLayerModule } from './compliance-layer/compliance-layer.module';
import { OperationsModule } from './operations/operations.module';
import { RolesGuard } from './auth/roles.guard';
import { LoggingInterceptor } from './common/logging.interceptor';

@Module({
  imports: [
    PrismaModule,
    CredentialsModule,
    VaultsModule,
    StrategiesModule,
    ConsentModule,
    EventsModule,
    AdminAuthModule,
    SasModule,
    VaultProgramModule,
    SolsticeModule,
    HealthModule,
    TranslationLayerModule,
    FinstarModule,
    ComplianceLayerModule,
    OperationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new RolesGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
