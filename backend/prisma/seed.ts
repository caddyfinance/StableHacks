import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.complianceEvent.deleteMany();
  await prisma.consentRequest.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.mandate.deleteMany();
  await prisma.vault.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.strategy.deleteMany();
  await prisma.adminUser.deleteMany();

  console.log('Cleared existing data');

  // Create admin users
  await prisma.adminUser.createMany({
    data: [
      {
        email: 'admin@amina.bank',
        password: 'admin123',
        name: 'Sarah Chen',
        role: 'admin',
      },
      {
        email: 'pm@amina.bank',
        password: 'pm123',
        name: 'Marcus Weber',
        role: 'portfolio_manager',
      },
      {
        email: 'compliance@amina.bank',
        password: 'compliance123',
        name: 'Elena Rossi',
        role: 'compliance_officer',
      },
      {
        email: 'emergency@amina.bank',
        password: 'emergency123',
        name: 'James Park',
        role: 'emergency_admin',
      },
    ],
  });

  console.log('Created admin users');

  // Create strategies
  const strategyA = await prisma.strategy.create({
    data: {
      strategyId: 'STBL-YIELD-01',
      name: 'Stablecoin Lending Adapter',
      description: 'Low-risk stablecoin lending exposure via approved institutional protocols',
      riskLevel: 'low',
      active: true,
      currentYield: 4.2,
    },
  });

  const strategyB = await prisma.strategy.create({
    data: {
      strategyId: 'TRSY-YIELD-01',
      name: 'Tokenised Treasury Adapter',
      description: 'Ultra-conservative tokenised US Treasury yield exposure',
      riskLevel: 'low',
      active: true,
      currentYield: 3.8,
    },
  });

  const strategyC = await prisma.strategy.create({
    data: {
      strategyId: 'HIGH-DEFI-01',
      name: 'High Yield DeFi Adapter',
      description: 'Higher-risk DeFi yield farming strategy — not permitted for conservative mandates',
      riskLevel: 'high',
      active: true,
      currentYield: 12.5,
    },
  });

  console.log('Created strategies:', strategyA.name, strategyB.name, strategyC.name);

  // Create credential
  const credential = await prisma.credential.create({
    data: {
      credentialId: 'SAS-VAULT-001',
      clientReference: 'INST-2048',
      jurisdiction: 'Switzerland',
      riskTier: 'Conservative',
      productEligibility: 'Institutional Yield Vault',
      walletAddress: '0xA91F...72C3',
      status: 'active',
    },
  });

  console.log('Created credential:', credential.credentialId);

  // Create vault
  const vault = await prisma.vault.create({
    data: {
      vaultId: 'VLT-001',
      credentialId: credential.credentialId,
      clientReference: credential.clientReference,
      ownerWallet: credential.walletAddress,
      baseAsset: 'USDC',
      status: 'active',
      idleBalance: 0,
      totalDeposited: 0,
      totalNAV: 0,
    },
  });

  console.log('Created vault:', vault.vaultId);

  // Create mandate
  const mandate = await prisma.mandate.create({
    data: {
      vaultId: vault.vaultId,
      allowedStrategies: ['STBL-YIELD-01', 'TRSY-YIELD-01'],
      blockedStrategies: ['HIGH-DEFI-01'],
      maxAllocationBps: {
        'STBL-YIELD-01': 6000,
        'TRSY-YIELD-01': 4000,
        'HIGH-DEFI-01': 0,
      },
      liquidityBufferBps: 1000,
      consentThreshold: 250000,
      leverageAllowed: false,
      approvedDestinations: ['0xDEST...4471', '0xCUST...1188', '0xBANK...9A01'],
      status: 'active',
    },
  });

  console.log('Created mandate for vault:', vault.vaultId);

  // Deposit 1,000,000 USDC
  await prisma.deposit.create({
    data: {
      vaultId: vault.vaultId,
      amount: 1000000,
      sourceWallet: '0xCUST...1188',
      sourceReference: 'SRC-7781',
      sourceType: 'Approved Custody-Linked Wallet',
      screeningStatus: 'Clear',
      jurisdictionTag: 'CH',
    },
  });

  await prisma.vault.update({
    where: { vaultId: vault.vaultId },
    data: {
      idleBalance: 1000000,
      totalDeposited: 1000000,
      totalNAV: 1000000,
    },
  });

  console.log('Deposited 1,000,000 USDC into vault VLT-001');

  // Seed compliance events for the setup
  await prisma.complianceEvent.createMany({
    data: [
      {
        eventId: 'EVT-001',
        actionType: 'CREDENTIAL_ISSUED',
        actor: 'admin',
        role: 'Admin',
        result: 'success',
        reason: 'Credential SAS-VAULT-001 issued for INST-2048',
        timestamp: new Date(Date.now() - 300000),
      },
      {
        eventId: 'EVT-002',
        vaultId: vault.vaultId,
        actionType: 'VAULT_CREATED',
        actor: 'admin',
        role: 'Admin',
        result: 'success',
        reason: 'Segregated vault VLT-001 created for credential SAS-VAULT-001',
        timestamp: new Date(Date.now() - 240000),
      },
      {
        eventId: 'EVT-003',
        vaultId: vault.vaultId,
        actionType: 'MANDATE_ATTACHED',
        actor: 'admin',
        role: 'Admin',
        result: 'success',
        reason: 'Mandate bound to vault VLT-001',
        timestamp: new Date(Date.now() - 180000),
      },
      {
        eventId: 'EVT-004',
        vaultId: vault.vaultId,
        actionType: 'DEPOSIT_RECORDED',
        actor: 'operations',
        role: 'Operations',
        asset: 'USDC',
        amount: 1000000,
        result: 'success',
        reason: 'Deposit of 1,000,000 USDC recorded. Source: SRC-7781',
        timestamp: new Date(Date.now() - 120000),
      },
    ],
  });

  console.log('Seeded compliance events');
  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
