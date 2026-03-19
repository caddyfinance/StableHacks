import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors();
  app.setGlobalPrefix('api');
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
