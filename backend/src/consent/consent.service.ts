import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class ConsentService {
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
    return this.prisma.consentRequest.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async approve(requestId: string) {
    const req = await this.prisma.consentRequest.findUnique({ where: { requestId } });
    if (!req) throw new NotFoundException('Consent request not found');
    if (req.status !== 'pending') throw new BadRequestException('Consent request is not pending');

    const updated = await this.prisma.consentRequest.update({
      where: { requestId },
      data: { status: 'approved', consentedBy: 'client_representative', consentedAt: new Date() },
    });

    await this.events.emit({
      vaultId: req.vaultId,
      actionType: 'CONSENT_GRANTED',
      actor: 'client_representative',
      role: 'Client Representative',
      asset: 'USDC',
      amount: req.amount,
      result: 'success',
      reason: `Client consent granted for ${req.actionType} of ${req.amount.toLocaleString()} USDC`,
    });

    return updated;
  }
}
