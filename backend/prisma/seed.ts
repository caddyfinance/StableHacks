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

  // Create strategy
  const strategy = await prisma.strategy.create({
    data: {
      strategyId: 'solstice-eusx-yield',
      name: 'Solstice eUSX Yield',
      description: 'On-chain yield via Solstice eUSX vault — deposit USDC, receive yield-bearing eUSX',
      riskLevel: 'low',
      active: true,
      currentYield: 8.5,
    },
  });

  console.log('Created strategy:', strategy.name);

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
      allowedStrategies: ['solstice-eusx-yield'],
      blockedStrategies: [],
      maxAllocationBps: {
        'solstice-eusx-yield': 10000,
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

  // Seed Translation Layer demo events (NP-33)
  const mockPdaBase = '7Xf9r2kBc4mVnPQ8dL3wH5tYjAeZ6Ks1NbCg';
  await prisma.complianceEvent.createMany({
    data: [
      {
        eventId: 'EVT-TL-001',
        vaultId: vault.vaultId,
        actionType: 'TL_PIPELINE_COMPLETE',
        actor: 'translation_layer',
        role: 'system',
        result: 'success',
        reason: 'Full pipeline: DEPOSIT 1,000,000 USDC — jurisdiction CH, travel rule exempt, routed to Solstice, GL posted',
        amount: 1000000,
        asset: 'USDC',
        translationLayerRef: `${mockPdaBase}InstrLog01aB`,
        compliancePda: `${mockPdaBase}ComplAttest01`,
        travelRulePda: `${mockPdaBase}TravelChk01x`,
        routingPda: `${mockPdaBase}RouteDecis01`,
        glEntryPda: `${mockPdaBase}GLEntry001ab`,
        timestamp: new Date(Date.now() - 100000),
      },
      {
        eventId: 'EVT-TL-002',
        vaultId: vault.vaultId,
        actionType: 'TL_COMPLIANCE_PASSED',
        actor: 'translation_layer',
        role: 'system',
        result: 'success',
        reason: 'Jurisdiction CH (FINMA): compliance attestation passed. Travel rule threshold 1,000 USDC.',
        amount: 500000,
        asset: 'USDC',
        compliancePda: `${mockPdaBase}ComplAttest02`,
        travelRulePda: `${mockPdaBase}TravelChk02x`,
        timestamp: new Date(Date.now() - 90000),
      },
      {
        eventId: 'EVT-TL-003',
        vaultId: vault.vaultId,
        actionType: 'TL_VENUE_ROUTED',
        actor: 'translation_layer',
        role: 'system',
        result: 'success',
        reason: 'Routed to Solstice eUSX Yield Vault via Mesh. Venue eligible, mandate allows.',
        amount: 500000,
        asset: 'USDC',
        routingPda: `${mockPdaBase}RouteDecis02`,
        timestamp: new Date(Date.now() - 85000),
      },
      {
        eventId: 'EVT-TL-004',
        vaultId: vault.vaultId,
        actionType: 'TL_BOOKED_BACK',
        actor: 'translation_layer',
        role: 'system',
        result: 'success',
        reason: 'GL entry posted to Finstar. Debit: 5010-STRATEGY-DEPLOYED, Credit: 2010-CLIENT-VLT-001. SWIFT: AMINCHZZXXX.',
        amount: 500000,
        asset: 'USDC',
        glEntryPda: `${mockPdaBase}GLEntry002ab`,
        timestamp: new Date(Date.now() - 80000),
      },
      {
        eventId: 'EVT-TL-005',
        vaultId: vault.vaultId,
        actionType: 'TL_PIPELINE_COMPLETE',
        actor: 'translation_layer',
        role: 'system',
        result: 'success',
        reason: 'Full pipeline: ALLOCATE 500,000 USDC to Solstice — all 5 PDAs created on-chain',
        amount: 500000,
        asset: 'USDC',
        translationLayerRef: `${mockPdaBase}InstrLog02aB`,
        compliancePda: `${mockPdaBase}ComplAttest03`,
        travelRulePda: `${mockPdaBase}TravelChk03x`,
        routingPda: `${mockPdaBase}RouteDecis03`,
        glEntryPda: `${mockPdaBase}GLEntry003ab`,
        timestamp: new Date(Date.now() - 75000),
      },
    ],
  });

  console.log('Seeded Translation Layer demo events');
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
