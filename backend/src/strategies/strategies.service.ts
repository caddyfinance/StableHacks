import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class StrategiesService {
  private prisma: PrismaService;
  private events: EventsService;
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EventsService) events: EventsService,
  ) {
    this.prisma = prisma;
    this.events = events;
  }

  async findAll() {
    return this.prisma.strategy.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async toggleDisable(strategyId: string, disabled: boolean) {
    const strategy = await this.prisma.strategy.update({
      where: { strategyId },
      data: { disabled },
    });

    await this.events.emit({
      actionType: disabled ? 'ADAPTER_DISABLED' : 'ADAPTER_ENABLED',
      actor: 'emergency_admin',
      role: 'Emergency Admin',
      strategy: strategyId,
      result: 'success',
      reason: disabled ? `Strategy adapter ${strategy.name} disabled` : `Strategy adapter ${strategy.name} re-enabled`,
    });

    return strategy;
  }
}
