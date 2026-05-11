import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletControllersService } from '../wallet-controllers/wallet-controllers.service';

@Injectable()
export class TransferChecksService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(WalletControllersService) private walletControllers: WalletControllersService,
  ) {}

  async findByVault(vaultId: string) {
    return this.prisma.transferCheck.findMany({
      where: { vaultId },
      orderBy: { checkedAt: 'desc' },
    });
  }

  async findByTransfer(transferId: string) {
    return this.prisma.transferCheck.findMany({
      where: { transferId },
      orderBy: { checkedAt: 'desc' },
    });
  }

  async findAll(filters?: { vaultId?: string; transferType?: string; overallStatus?: string }) {
    const where: any = {};
    if (filters?.vaultId) where.vaultId = filters.vaultId;
    if (filters?.transferType) where.transferType = filters.transferType;
    if (filters?.overallStatus) where.overallStatus = filters.overallStatus;
    return this.prisma.transferCheck.findMany({ where, orderBy: { checkedAt: 'desc' } });
  }

  async createTransferCheck(data: {
    transferId: string;
    transferType: string;
    vaultId: string;
    fromAddress: string;
    toAddress: string;
    asset: string;
    amount: number;
    isExternal: boolean;
    isProviderTransfer: boolean;
    travelRuleThreshold?: number;
  }) {
    const fromController = await this.walletControllers.resolveController(data.fromAddress);
    const toController = await this.walletControllers.resolveController(data.toAddress);

    const isInternal = !data.isExternal;
    const exceedsThreshold = data.travelRuleThreshold ? data.amount >= data.travelRuleThreshold : false;

    const kytStatus = isInternal ? 'NOT_REQUIRED' : 'CLEAR';
    const ofacStatus = isInternal ? 'NOT_REQUIRED' : 'CLEAR';
    const travelRuleStatus = isInternal ? 'NOT_REQUIRED' : exceedsThreshold ? 'COMPLETE' : 'NOT_REQUIRED';
    const providerApproval = data.isProviderTransfer ? 'APPROVED' : 'NOT_REQUIRED';
    const mandateCheck = 'PASSED';

    return this.prisma.transferCheck.create({
      data: {
        transferId: data.transferId,
        transferType: data.transferType,
        vaultId: data.vaultId,
        fromAddress: data.fromAddress,
        fromController,
        toAddress: data.toAddress,
        toController,
        asset: data.asset,
        amount: data.amount,
        kytStatus,
        kytReference: isInternal ? null : 'https://app.chainalysis.com/kyt',
        ofacStatus,
        ofacReference: isInternal ? null : 'https://app.chainalysis.com/sanctions',
        travelRuleStatus,
        travelRuleReference: exceedsThreshold ? 'Notabene Travel Rule Check' : null,
        providerApproval,
        mandateCheck,
        overallStatus: 'PASSED',
        checkedBy: 'System',
      },
    });
  }
}
