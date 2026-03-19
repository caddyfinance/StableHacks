import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns the health status of the API and database.' })
  @ApiOkResponse({ description: 'Service is healthy' })
  async check() {
    let dbStatus = 'up';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      service: 'amina-vault-backend',
      details: { database: { status: dbStatus } },
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check', description: 'Lightweight readiness probe.' })
  @ApiOkResponse({ description: 'Service is ready' })
  ready() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'amina-vault-backend',
      version: process.env.npm_package_version || '1.0.0',
    };
  }
}
