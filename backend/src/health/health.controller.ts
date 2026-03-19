import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check', description: 'Returns the health status of the API and its dependencies (database).' })
  @ApiOkResponse({ description: 'Service is healthy' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check', description: 'Lightweight readiness probe for load balancers and Railway.' })
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
