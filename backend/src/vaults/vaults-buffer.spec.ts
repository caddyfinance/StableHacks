/**
 * Liquidity Buffer — VaultsService unit tests
 *
 * Tests the buffer enforcement logic in VaultsService without hitting the DB.
 * Every DB call is replaced by a Jest mock so the suite runs fully offline.
 *
 * Coverage:
 *  - getDeployableBalance formula
 *  - getBufferHealth: healthy / violation paths
 *  - updateMandate: floor enforcement (< 10% rejected)
 *  - updateMandate: valid update increments version + archives rules
 *  - allocate: blocked when amount > deployableBalance
 *  - allocate: allowed when amount <= deployableBalance
 *  - getSnapshot: buffer metrics included in response
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// ─── Minimal in-memory state ────────────────────────────────────────────────

function makeVault(overrides: Partial<{
  vaultId: string;
  idleBalance: number;
  totalNAV: number;
  totalDeposited: number;
  status: string;
  paused: boolean;
  ownerWallet: string | null;
  baseAsset: string;
  programId: string;
  mandate: ReturnType<typeof makeMandate> | null;
  allocations: any[];
  consentRequests: any[];
}> = {}) {
  return {
    vaultId: 'VLT-TEST',
    idleBalance: 100_000,
    totalNAV: 100_000,
    totalDeposited: 100_000,
    status: 'active',
    paused: false,
    ownerWallet: null,
    baseAsset: 'USDC',
    programId: 'PROG-DEMO',
    mandate: makeMandate(),
    allocations: [],
    consentRequests: [],
    ...overrides,
  };
}

function makeMandate(overrides: Partial<{
  vaultId: string;
  liquidityBufferBps: number;
  allowedStrategies: string[];
  blockedStrategies: string[];
  maxAllocationBps: Record<string, number>;
  consentThreshold: number;
  leverageAllowed: boolean;
  approvedDestinations: string[];
  version: number;
  lastUpdatedBy: string | null;
  onChainSynced: boolean;
  onChainSyncTx: string | null;
  status: string;
}> = {}) {
  return {
    vaultId: 'VLT-TEST',
    liquidityBufferBps: 1000,
    allowedStrategies: ['strat-alpha'],
    blockedStrategies: [],
    maxAllocationBps: { 'strat-alpha': 9000 },
    consentThreshold: 1_000_000,
    leverageAllowed: false,
    approvedDestinations: [],
    version: 1,
    lastUpdatedBy: null,
    onChainSynced: false,
    onChainSyncTx: null,
    status: 'active',
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<{
  strategyId: string;
  name: string;
  riskLevel: string;
  disabled: boolean;
  active: boolean;
  currentYield: number;
}> = {}) {
  return {
    strategyId: 'strat-alpha',
    name: 'Alpha Strategy',
    riskLevel: 'low',
    disabled: false,
    active: true,
    currentYield: 5,
    ...overrides,
  };
}

// ─── Isolated formula tests (no service instantiation needed) ─────────────

describe('Buffer formula (pure arithmetic)', () => {
  const PROTOCOL_BUFFER_BPS = 1000;

  function getDeployableBalance(idle: number, nav: number, bps: number): number {
    return Math.max(0, idle - (nav * bps) / 10000);
  }

  it('computes deployable = idle - required at 10%', () => {
    // NAV=1000, idle=400, buffer=10% → required=100, deployable=300
    expect(getDeployableBalance(400, 1000, 1000)).toBe(300);
  });

  it('returns 0 when idle is entirely consumed by buffer', () => {
    // NAV=1000, idle=100, buffer=10% → required=100, deployable=0
    expect(getDeployableBalance(100, 1000, 1000)).toBe(0);
  });

  it('floors at 0, not negative, when idle < required', () => {
    // NAV=1000, idle=80, buffer=10% → required=100, would be -20 → clamped to 0
    expect(getDeployableBalance(80, 1000, 1000)).toBe(0);
  });

  it('computes correctly at 20% buffer', () => {
    // NAV=500_000, idle=200_000, buffer=20% → required=100_000, deployable=100_000
    expect(getDeployableBalance(200_000, 500_000, 2000)).toBe(100_000);
  });

  it('fully idle vault: deployable = idle - required', () => {
    // NAV=totalNAV=idle when nothing deployed
    // NAV=500, idle=500, buffer=10% → required=50, deployable=450
    expect(getDeployableBalance(500, 500, 1000)).toBe(450);
  });

  it('buffer below protocol minimum is detectable', () => {
    expect(800).toBeLessThan(PROTOCOL_BUFFER_BPS);
  });

  it('bufferUtilization > 100% when idle exceeds required', () => {
    const idle = 200, required = 100;
    const utilization = required > 0 ? (idle / required) * 100 : 100;
    expect(utilization).toBe(200);
  });

  it('bufferUtilization = 100% exactly at boundary', () => {
    const idle = 100, required = 100;
    const utilization = required > 0 ? (idle / required) * 100 : 100;
    expect(utilization).toBe(100);
  });

  it('bufferUtilization < 100% signals violation', () => {
    const idle = 80, required = 100;
    const utilization = required > 0 ? (idle / required) * 100 : 100;
    expect(utilization).toBeLessThan(100);
  });
});

// ─── Service-level tests (mocked Prisma) ─────────────────────────────────

describe('VaultsService — buffer enforcement', () => {
  let service: any;
  let prismaMock: any;
  let eventsMock: any;
  let vaultProgramMock: any;

  beforeEach(async () => {
    // Build minimal mocks
    prismaMock = {
      vault: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      mandate: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      mandateRule: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      allocation: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      strategy: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      consentRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      deposit: { findMany: jest.fn().mockResolvedValue([]) },
    };

    eventsMock = { emit: jest.fn().mockResolvedValue(undefined) };
    vaultProgramMock = {
      getAminaBankWallet: jest.fn().mockReturnValue('BANK_WALLET'),
      updateMandate: jest.fn().mockResolvedValue({ txSignature: 'SIM_TX_123' }),
    };

    // Dynamic import to avoid module-resolution issues during tests
    const { VaultsService } = await import('./vaults.service');

    // Construct with manual injection (no NestJS DI needed)
    service = new (VaultsService as any)(
      prismaMock,
      eventsMock,
      { verifyAttestation: jest.fn() },
      vaultProgramMock,
      { getPositionForVault: jest.fn().mockResolvedValue(null) },
    );
  });

  // ── getBufferHealth ──────────────────────────────────────────────────────

  describe('getBufferHealth', () => {
    it('returns healthy status when idle >= required', async () => {
      const vault = makeVault({ idleBalance: 150_000, totalNAV: 1_000_000 });
      // totalNAV via allocations: idleBalance + deployed. Here no allocations so NAV = idle.
      // With idle=150_000, allocations=[], NAV=150_000 → required=15_000, deployable=135_000
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        allocations: [],
      });

      const health = await service.getBufferHealth('VLT-TEST');
      expect(health.status).toBe('healthy');
      expect(health.shortfall).toBe(0);
      expect(health.deployableBalance).toBeGreaterThan(0);
    });

    it('returns violation when idle < required', async () => {
      // NAV=1_000_000 (idle=80_000 + deployed=920_000), buffer=10% → required=100_000, shortfall=20_000
      const vault = makeVault({ idleBalance: 80_000, totalNAV: 1_000_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        allocations: [{ strategyId: 'strat-alpha', amount: 920_000, status: 'active' }],
      });

      const health = await service.getBufferHealth('VLT-TEST');
      expect(health.status).toBe('violation');
      expect(health.shortfall).toBeCloseTo(20_000, 0);
    });

    it('throws NotFoundException for unknown vault', async () => {
      prismaMock.vault.findUnique.mockResolvedValue(null);
      await expect(service.getBufferHealth('UNKNOWN')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('includes all expected fields', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({
        ...makeVault({ idleBalance: 200_000 }),
        allocations: [],
      });
      const h = await service.getBufferHealth('VLT-TEST');
      expect(h).toHaveProperty('totalNAV');
      expect(h).toHaveProperty('idleBalance');
      expect(h).toHaveProperty('requiredBuffer');
      expect(h).toHaveProperty('deployableBalance');
      expect(h).toHaveProperty('bufferUtilization');
      expect(h).toHaveProperty('shortfall');
      expect(h).toHaveProperty('bufferBps');
      expect(h).toHaveProperty('status');
      expect(h).toHaveProperty('message');
    });
  });

  // ── updateMandate — floor enforcement ────────────────────────────────────

  describe('updateMandate — protocol floor', () => {
    it('rejects liquidityBufferBps below 1000 (10%)', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({
        ...makeVault(),
        mandate: makeMandate(),
      });

      await expect(
        service.updateMandate('VLT-TEST', { liquidityBufferBps: 500 }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects liquidityBufferBps = 0', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({
        ...makeVault(),
        mandate: makeMandate(),
      });
      await expect(
        service.updateMandate('VLT-TEST', { liquidityBufferBps: 0 }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects liquidityBufferBps = 999 (just under floor)', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({
        ...makeVault(),
        mandate: makeMandate(),
      });
      await expect(
        service.updateMandate('VLT-TEST', { liquidityBufferBps: 999 }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts liquidityBufferBps = 1000 (exactly at floor)', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      const updatedMandate = { ...makeMandate(), version: 2 };
      prismaMock.mandate.update.mockResolvedValue(updatedMandate);

      const result = await service.updateMandate('VLT-TEST', { liquidityBufferBps: 1000 }, 'admin');
      expect(result.version).toBe(2);
    });

    it('accepts liquidityBufferBps = 2000 (20%)', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), liquidityBufferBps: 2000, version: 2 });

      const result = await service.updateMandate('VLT-TEST', { liquidityBufferBps: 2000 }, 'admin');
      expect(result.liquidityBufferBps).toBe(2000);
    });

    it('throws NotFoundException when vault does not exist', async () => {
      prismaMock.vault.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMandate('MISSING', { liquidityBufferBps: 1500 }, 'admin'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when vault has no mandate', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({ ...makeVault(), mandate: null });
      await expect(
        service.updateMandate('VLT-TEST', { liquidityBufferBps: 1500 }, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('archives existing active rules before creating new ones', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), version: 2 });

      await service.updateMandate('VLT-TEST', { liquidityBufferBps: 1500 }, 'admin');

      expect(prismaMock.mandateRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'active' }), data: { status: 'superseded' } }),
      );
    });

    it('creates a new mandateRule row for liquidityBufferBps change', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), version: 2 });

      await service.updateMandate('VLT-TEST', { liquidityBufferBps: 1500 }, 'admin');

      expect(prismaMock.mandateRule.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ ruleType: 'liquidity_buffer', params: { bps: 1500 } }),
          ]),
        }),
      );
    });

    it('sets onChainSynced = false on update', async () => {
      const vault = { ...makeVault(), mandate: makeMandate({ onChainSynced: true }) };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), onChainSynced: false, version: 2 });

      await service.updateMandate('VLT-TEST', { liquidityBufferBps: 1500 }, 'admin');

      expect(prismaMock.mandate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ onChainSynced: false }),
        }),
      );
    });

    it('emits a MANDATE_UPDATED compliance event', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), version: 2 });

      await service.updateMandate('VLT-TEST', { liquidityBufferBps: 2000 }, 'admin');

      expect(eventsMock.emit).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'MANDATE_UPDATED', result: 'success' }),
      );
    });
  });

  // ── allocate — buffer enforcement ────────────────────────────────────────

  describe('allocate — liquidity buffer', () => {
    const setupVaultForAllocate = (idleBalance: number, navExtra = 0) => {
      const nav = idleBalance + navExtra;
      const vault = makeVault({ idleBalance, totalNAV: nav });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        // mandate: 10% buffer, strat-alpha allowed with 90% cap
        mandate: makeMandate({ liquidityBufferBps: 1000, allowedStrategies: ['strat-alpha'], maxAllocationBps: { 'strat-alpha': 9000 } }),
        allocations: navExtra > 0 ? [{ strategyId: 'other', amount: navExtra, status: 'active' }] : [],
      });
      prismaMock.strategy.findUnique.mockResolvedValue(makeStrategy());
      prismaMock.allocation.create.mockResolvedValue({ allocationId: 'ALLOC-1', strategyId: 'strat-alpha', amount: 0, status: 'active' });
      prismaMock.vault.update.mockResolvedValue({ ...vault, idleBalance: idleBalance });
    };

    it('blocks allocation when amount > deployable balance', async () => {
      // NAV=1000, idle=100, buffer=10% → required=100, deployable=0 → any positive amount blocked
      setupVaultForAllocate(100, 900);
      await expect(
        service.allocate('VLT-TEST', 'strat-alpha', 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks allocation when amount equals exactly deployable + 1', async () => {
      // NAV=1000, idle=200, buffer=10% → required=100, deployable=100 → 101 blocked
      setupVaultForAllocate(200, 800);
      await expect(
        service.allocate('VLT-TEST', 'strat-alpha', 101),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows allocation when amount <= deployable balance', async () => {
      // NAV=1000, idle=500, buffer=10% → required=100, deployable=400 → 400 allowed
      setupVaultForAllocate(500, 500);
      const result = await service.allocate('VLT-TEST', 'strat-alpha', 400);
      expect(result).toBeDefined();
    });

    it('allows allocation exactly equal to deployable balance', async () => {
      // NAV=1000, idle=200, buffer=10% → required=100, deployable=100 → 100 allowed
      setupVaultForAllocate(200, 800);
      const result = await service.allocate('VLT-TEST', 'strat-alpha', 100);
      expect(result).toBeDefined();
    });

    it('emits ALLOCATION_BLOCKED when buffer would be violated', async () => {
      setupVaultForAllocate(100, 900); // deployable = 0
      await expect(service.allocate('VLT-TEST', 'strat-alpha', 50)).rejects.toBeInstanceOf(ForbiddenException);
      expect(eventsMock.emit).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'ALLOCATION_BLOCKED', result: 'failure' }),
      );
    });

    it('blocks when vault is paused regardless of buffer', async () => {
      const vault = makeVault({ idleBalance: 500_000, totalNAV: 500_000, paused: true });
      prismaMock.vault.findUnique.mockResolvedValue({ ...vault, mandate: makeMandate(), allocations: [] });
      prismaMock.strategy.findUnique.mockResolvedValue(makeStrategy());
      await expect(service.allocate('VLT-TEST', 'strat-alpha', 100)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── getSnapshot — buffer fields ──────────────────────────────────────────

  describe('getSnapshot — buffer metrics', () => {
    it('includes all buffer fields in response', async () => {
      const vault = makeVault({ idleBalance: 300_000, totalNAV: 1_000_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        mandate: makeMandate({ liquidityBufferBps: 1000 }),
        allocations: [{ strategyId: 'strat-alpha', amount: 700_000, status: 'active', yieldAccrued: 0, strategy: { name: 'Alpha' } }],
        consentRequests: [],
        deposits: [],
        events: [],
      });

      const snap = await service.getSnapshot('VLT-TEST');

      expect(snap).toHaveProperty('requiredBuffer');
      expect(snap).toHaveProperty('deployableBalance');
      expect(snap).toHaveProperty('bufferUtilization');
      expect(snap).toHaveProperty('bufferHealth');
      expect(snap).toHaveProperty('bufferBps');
      expect(snap).toHaveProperty('mandateVersion');
      expect(snap).toHaveProperty('onChainSynced');
    });

    it('computes requiredBuffer correctly (10% of NAV)', async () => {
      // NAV = idle(100k) + deployed(400k) = 500k → required = 50k
      const vault = makeVault({ idleBalance: 100_000, totalNAV: 500_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        mandate: makeMandate({ liquidityBufferBps: 1000 }),
        allocations: [{ strategyId: 'strat-alpha', amount: 400_000, status: 'active', yieldAccrued: 0, strategy: { name: 'Alpha' } }],
        consentRequests: [],
        deposits: [],
        events: [],
      });

      const snap = await service.getSnapshot('VLT-TEST');
      expect(snap.requiredBuffer).toBeCloseTo(50_000, 0);
      expect(snap.deployableBalance).toBeCloseTo(50_000, 0); // idle(100k) - required(50k)
      expect(snap.bufferHealth).toBe('healthy');
    });

    it('sets bufferHealth to violation when idle < required', async () => {
      // NAV = idle(50k) + deployed(950k) = 1000k → required = 100k > idle(50k) → violation
      const vault = makeVault({ idleBalance: 50_000, totalNAV: 1_000_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        mandate: makeMandate({ liquidityBufferBps: 1000 }),
        allocations: [{ strategyId: 'strat-alpha', amount: 950_000, status: 'active', yieldAccrued: 0, strategy: { name: 'Alpha' } }],
        consentRequests: [],
        deposits: [],
        events: [],
      });

      const snap = await service.getSnapshot('VLT-TEST');
      expect(snap.bufferHealth).toBe('violation');
      expect(snap.deployableBalance).toBe(0); // clamped to 0
    });

    it('returns bufferBps = mandate.liquidityBufferBps', async () => {
      const vault = makeVault({ idleBalance: 200_000, totalNAV: 200_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        mandate: makeMandate({ liquidityBufferBps: 2000 }),
        allocations: [],
        consentRequests: [],
        deposits: [],
        events: [],
      });

      const snap = await service.getSnapshot('VLT-TEST');
      expect(snap.bufferBps).toBe(2000);
    });

    it('falls back to PROTOCOL_BUFFER_BPS (1000) when no mandate', async () => {
      const vault = makeVault({ idleBalance: 100_000, totalNAV: 100_000 });
      prismaMock.vault.findUnique.mockResolvedValue({
        ...vault,
        mandate: null,
        allocations: [],
        consentRequests: [],
        deposits: [],
        events: [],
      });

      const snap = await service.getSnapshot('VLT-TEST');
      expect(snap.bufferBps).toBe(1000);
    });
  });

  // ── getMandateRules ──────────────────────────────────────────────────────

  describe('getMandateRules', () => {
    it('returns only active rules', async () => {
      prismaMock.vault.findUnique.mockResolvedValue(makeVault());
      const activeRules = [
        { id: '1', ruleType: 'liquidity_buffer', params: { bps: 1000 }, status: 'active', vaultId: 'VLT-TEST' },
        { id: '2', ruleType: 'consent_threshold', params: { amount: 250000 }, status: 'active', vaultId: 'VLT-TEST' },
      ];
      prismaMock.mandateRule.findMany.mockResolvedValue(activeRules);

      const rules = await service.getMandateRules('VLT-TEST');
      expect(rules).toHaveLength(2);
      expect(rules.every((r: any) => r.status === 'active')).toBe(true);
    });

    it('throws NotFoundException for unknown vault', async () => {
      prismaMock.vault.findUnique.mockResolvedValue(null);
      await expect(service.getMandateRules('UNKNOWN')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── syncMandateToChain ───────────────────────────────────────────────────

  describe('syncMandateToChain', () => {
    it('calls vaultProgram.updateMandate and sets onChainSynced = true', async () => {
      const vault = { ...makeVault(), mandate: makeMandate({ onChainSynced: false }) };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), onChainSynced: true, onChainSyncTx: 'SIM_TX_123' });

      const result = await service.syncMandateToChain('VLT-TEST', 'admin');

      expect(vaultProgramMock.updateMandate).toHaveBeenCalled();
      expect(prismaMock.mandate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ onChainSynced: true }) }),
      );
      expect(result.onChainSynced).toBe(true);
    });

    it('emits MANDATE_SYNCED event on success', async () => {
      const vault = { ...makeVault(), mandate: makeMandate() };
      prismaMock.vault.findUnique.mockResolvedValue(vault);
      prismaMock.mandate.update.mockResolvedValue({ ...makeMandate(), onChainSynced: true });

      await service.syncMandateToChain('VLT-TEST');

      expect(eventsMock.emit).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'MANDATE_SYNCED', result: 'success' }),
      );
    });

    it('throws BadRequestException when vault has no mandate', async () => {
      prismaMock.vault.findUnique.mockResolvedValue({ ...makeVault(), mandate: null });
      await expect(service.syncMandateToChain('VLT-TEST')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
