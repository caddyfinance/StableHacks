import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletControllersService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.walletController.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findByAddress(address: string) {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    if (!controller) throw new NotFoundException('Wallet controller not found');
    return controller;
  }

  async create(data: any) {
    return this.prisma.walletController.create({
      data: {
        address: data.address,
        controllerName: data.controllerName,
        controllerType: data.controllerType || 'UNKNOWN',
        permittedUse: data.permittedUse,
        verificationStatus: data.verificationStatus || 'VERIFIED',
        explorerLink: data.explorerLink || null,
        chainalysisLink: data.chainalysisLink || null,
        vaultId: data.vaultId || null,
        providerId: data.providerId || null,
      },
    });
  }

  async resolveController(address: string): Promise<string> {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    return controller?.controllerName || 'Unknown';
  }

  async resolveControllerType(address: string): Promise<string> {
    const controller = await this.prisma.walletController.findUnique({ where: { address } });
    return controller?.controllerType || 'UNKNOWN';
  }
}
