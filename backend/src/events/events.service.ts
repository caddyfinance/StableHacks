import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class EventsService {
  private prisma: PrismaService;
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async emit(params: {
    vaultId?: string;
    actionType: string;
    actor: string;
    role: string;
    asset?: string;
    amount?: number;
    strategy?: string;
    result: string;
    reason?: string;
    txSignature?: string;
    onChainAddress?: string;
    translationLayerRef?: string;
    compliancePda?: string;
    travelRulePda?: string;
    routingPda?: string;
    glEntryPda?: string;
  }) {
    const prefix = params.result === 'success' ? 'EVT' : params.result === 'pending' ? 'PND' : 'FAIL';
    const shortId = uuid().slice(0, 6).toUpperCase();
    const eventId = `${prefix}-${shortId}`;

    return this.prisma.complianceEvent.create({
      data: { eventId, ...params },
    });
  }

  async findAll(vaultId?: string, actionType?: string) {
    const where: Record<string, unknown> = {};
    if (vaultId) where.vaultId = vaultId;
    if (actionType) where.actionType = actionType;

    return this.prisma.complianceEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }
}
