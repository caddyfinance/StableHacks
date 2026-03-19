import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors();
  app.setGlobalPrefix('api');

  // ─── Swagger / OpenAPI ──────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AMINA Vault API')
    .setDescription(
      'Institutional Yield Vault API for segregated, non-pooled vault management.\n\n' +
      '**Modules:** Credentials (SAS), Vaults, Strategies, Mandate, Funding, Execution, ' +
      'Consent, Compliance Events, Emergency Controls, Solstice Yield Protocol.\n\n' +
      '**Authentication:** Role-based access via `x-role` header.\n\n' +
      '**Roles:** `admin`, `portfolio_manager`, `compliance_officer`, `emergency_admin`, `client_representative`',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-role', in: 'header', description: 'Role for RBAC (e.g. admin, portfolio_manager)' }, 'x-role')
    .addApiKey({ type: 'apiKey', name: 'x-wallet', in: 'header', description: 'Caller wallet address (for client operations)' }, 'x-wallet')
    .addTag('Health', 'Service health and readiness probes')
    .addTag('Admin Auth', 'Microsoft Entra ID authentication and admin user management')
    .addTag('Credentials', 'SAS credential issuance, revocation, and wallet binding')
    .addTag('Vaults', 'Segregated vault creation, funding, allocation, redemption, and on/off-ramp')
    .addTag('Strategies', 'Strategy configuration and adapter controls')
    .addTag('Consent', 'Client consent management for high-value operations')
    .addTag('Events', 'Compliance event timeline and audit trail')
    .addTag('Solstice', 'Solstice eUSX yield protocol integration (on-chain)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'AMINA Vault API — Swagger',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  const port = process.env.PORT || 3001;
  const host = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`;
  await app.listen(port, '0.0.0.0');

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       AMINA Vault Backend — Running          ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  URL:          ${host}`);
  console.log(`  Swagger:      ${host}/api/docs`);
  console.log(`  Health:       ${host}/api/health`);
  console.log(`  Port:         ${port}`);
  console.log(`  Environment:  ${process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'development'}`);
  console.log(`  Database:     ${process.env.DATABASE_URL ? 'Connected' : 'NOT SET'}`);
  console.log(`  Solana RPC:   ${process.env.SOLANA_RPC_URL ? 'Configured' : 'NOT SET'}`);
  console.log(`  SAS Issuer:   ${process.env.SAS_ISSUER_KEYPAIR ? 'Configured' : 'NOT SET'}`);
  console.log(`  Bank Keypair: ${process.env.AMINA_BANK_KEYPAIR ? 'Configured' : 'Using SAS Issuer fallback'}`);
  console.log(`  Solstice API: ${process.env.USX_API_URL ? 'Configured' : 'NOT SET'}`);
  console.log('');
}
bootstrap();
