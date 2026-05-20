import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.transferCheck.deleteMany();
  await prisma.gLEntry.deleteMany();
  await prisma.translationLayerInstruction.deleteMany();
  await prisma.providerMonitoringSnapshot.deleteMany();
  await prisma.walletController.deleteMany();
  await prisma.complianceEvent.deleteMany();
  await prisma.consentRequest.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.mandateRule.deleteMany();
  await prisma.mandate.deleteMany();
  await prisma.vault.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.strategy.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.adminUser.deleteMany();

  console.log('Cleared existing data');

  // ─── Admin Users ───────────────────────────────────────────────
  await prisma.adminUser.createMany({
    data: [
      { email: 'admin@amina.bank', password: 'admin123', name: 'Sarah Chen', role: 'admin' },
      { email: 'pm@amina.bank', password: 'pm123', name: 'Marcus Weber', role: 'portfolio_manager' },
      { email: 'compliance@amina.bank', password: 'compliance123', name: 'Elena Rossi', role: 'compliance_officer' },
      { email: 'emergency@amina.bank', password: 'emergency123', name: 'James Park', role: 'emergency_admin' },
    ],
  });
  console.log('Created admin users');

  // ─── Provider Profile ────────────────────────
  const provider = await prisma.providerProfile.create({
    data: {
      providerName: 'Solstice Finance',
      strategy: 'YieldVault / institutional yield route',
      status: 'APPROVED',
      bankReviewStatus: 'Completed',
      providerType: 'Approved External Yield Provider',
      kytStatus: 'Clear',
      ofacSanctionsStatus: 'Clear',
      travelRuleTreatment: 'External transfer edge review applied where applicable',
      protocolDueDiligence: 'Completed',
      mandateFit: ['Conservative', 'Stable Yield'],
      exposureLimit: 60,
      lastReviewDate: new Date('2026-03-18'),
      nextReviewDate: new Date('2026-06-18'),
      reviewNotes: 'Approved for demo strategy route. Quarterly review scheduled.',
      evidencePackUrl: '/documents/solstice-diligence-pack-v1.pdf',
      jurisdictionTreatment: 'Bank-reviewed',
      clientEligibility: 'Institutional only',
      vaultEligibility: ['Stable Yield', 'Conservative Yield'],
      destinationWallet: 'Approved',
      kytScreeningRequired: true,
      ofacScreeningRequired: true,
      travelRuleRequired: true,
    },
  });
  console.log('Created Provider Profile:', provider.providerName);

  // ─── Provider Monitoring Snapshot ──────────────────
  await prisma.providerMonitoringSnapshot.create({
    data: {
      providerId: provider.id,
      bankApprovalStatus: 'Approved',
      strategyStatus: 'Available',
      contractMonitoring: 'No new critical event',
      kytExposure: 'Clear',
      ofacStatus: 'Clear',
      liquidityStatus: 'Within approved range',
      reviewStatus: 'Current',
      lastReviewed: new Date('2026-03-18'),
      nextReview: new Date('2026-06-18'),
    },
  });
  console.log('Created Provider Monitoring Snapshot');

  // ─── Strategy (linked to provider) ─────────────────
  const strategy = await prisma.strategy.create({
    data: {
      strategyId: 'solstice-eusx-yield',
      name: 'Solstice eUSX Yield',
      description: 'On-chain yield via Solstice eUSX vault — deposit USDC, receive yield-bearing eUSX',
      riskLevel: 'low',
      active: true,
      currentYield: 8.5,
      providerId: provider.id,
    },
  });
  console.log('Created strategy:', strategy.name, '(linked to provider)');

  // ─── Credentials & Vaults ──────────────────────────────────────
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
  await prisma.mandate.create({
    data: {
      vaultId: vault.vaultId,
      allowedStrategies: ['solstice-eusx-yield'],
      blockedStrategies: [],
      maxAllocationBps: { 'solstice-eusx-yield': 10000 },
      liquidityBufferBps: 1000,
      consentThreshold: 250000,
      leverageAllowed: false,
      approvedDestinations: ['0xDEST...4471', '0xCUST...1188', '0xBANK...9A01'],
      status: 'active',
    },
  });
  console.log('Created mandate for vault:', vault.vaultId);

  // Deposit
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
    data: { idleBalance: 1000000, totalDeposited: 1000000, totalNAV: 1000000 },
  });
  console.log('Deposited 1,000,000 USDC into vault VLT-001');

  // ─── Abu Dhabi second vault ────────────────────────────────────
  const cred2 = await prisma.credential.create({
    data: {
      credentialId: 'SAS-VAULT-002',
      clientReference: 'INST-3072',
      jurisdiction: 'AE-AZ',
      riskTier: 'Moderate',
      productEligibility: 'Institutional Yield Vault',
      walletAddress: '0xADBD9001ABUDHABI0000000000000000000000',
      status: 'active',
      revoked: false,
      attestationPda: 'F6dD2YrN5iJjmPe5YhExMhBTbT1jLGYKsEF3rfrjK5Wm',
      attestationTxSig: '5UeA2YcTdWJ6QqMLqYH3jMqS3RqweRh2GNxM6KTDvGYxDnJbEkSjbFJm3mG2HYvXkJTgrn7qN5LwfYrsh6ApGVqN',
    },
  });
  console.log('Created credential:', cred2.credentialId);

  const vault2 = await prisma.vault.create({
    data: {
      vaultId: 'VLT-002',
      credentialId: cred2.credentialId,
      clientReference: 'INST-3072',
      ownerWallet: '0xADBD9001ABUDHABI0000000000000000000000',
      baseAsset: 'USDC',
      status: 'active',
      paused: false,
      idleBalance: 200000,
      totalDeposited: 500000,
      totalNAV: 500000,
    },
  });
  console.log('Created vault:', vault2.vaultId);

  await prisma.mandate.create({
    data: {
      vaultId: vault2.vaultId,
      allowedStrategies: ['solstice-eusx-yield'],
      blockedStrategies: [],
      maxAllocationBps: { 'solstice-eusx-yield': 10000 },
      liquidityBufferBps: 1500,
      consentThreshold: 100000,
      leverageAllowed: true,
      approvedDestinations: [
        '0xADBD-CUSTODY-01-ABUDHABI-000000000000000',
        '0xADBD-CUSTODY-02-ABUDHABI-000000000000000',
      ],
      status: 'active',
      version: 1,
      lastUpdatedBy: 'admin',
      onChainSynced: false,
    },
  });
  console.log('Created mandate for vault:', vault2.vaultId);

  await prisma.deposit.create({
    data: {
      vaultId: vault2.vaultId,
      amount: 500000,
      sourceWallet: '0xADBD-TREASURY-ABUDHABI-000000000000000',
      sourceReference: 'ADGM-2026-001',
      sourceType: 'Approved Custody-Linked Wallet',
      screeningStatus: 'Clear',
      jurisdictionTag: 'AE-AZ',
    },
  });
  console.log('Deposited 500,000 USDC into vault VLT-002');

  // ─── Wallet Controller Registry ────────────────────
  await prisma.walletController.createMany({
    data: [
      {
        address: '0xBANK...9A01',
        controllerName: 'Amina Treasury',
        controllerType: 'BANK_TREASURY',
        permittedUse: 'Bank operations, on-ramp/off-ramp, custodial holding',
        verificationStatus: 'VERIFIED',
        explorerLink: 'https://explorer.solana.com/address/AminaBank9A01',
      },
      {
        address: '0xCUST...1188',
        controllerName: 'Client INST-2048 Stablecoin Account',
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault funding, deposits',
        verificationStatus: 'VERIFIED',
        explorerLink: 'https://explorer.solana.com/address/Client1188',
      },
      {
        address: '0xADBD-TREASURY-ABUDHABI-000000000000000',
        controllerName: 'Client INST-3072 Stablecoin Account',
        controllerType: 'CLIENT_ACCOUNT',
        permittedUse: 'Vault funding, deposits (Abu Dhabi)',
        verificationStatus: 'VERIFIED',
        explorerLink: 'https://explorer.solana.com/address/ADBDTreasury',
      },
      {
        address: '0xA91F...72C3',
        controllerName: 'VLT-001 Segregated Vault',
        controllerType: 'SEGREGATED_VAULT',
        permittedUse: 'Vault operations, strategy allocation',
        verificationStatus: 'VERIFIED',
        vaultId: 'VLT-001',
        explorerLink: 'https://explorer.solana.com/address/VLT001',
      },
      {
        address: '0xADBD9001ABUDHABI0000000000000000000000',
        controllerName: 'VLT-002 Segregated Vault',
        controllerType: 'SEGREGATED_VAULT',
        permittedUse: 'Vault operations, strategy allocation (Abu Dhabi)',
        verificationStatus: 'VERIFIED',
        vaultId: 'VLT-002',
        explorerLink: 'https://explorer.solana.com/address/VLT002',
      },
      {
        address: '0xSOLSTICE-PROVIDER-WALLET-0000000000000',
        controllerName: 'Solstice Finance Provider',
        controllerType: 'PROVIDER_ADDRESS',
        permittedUse: 'Strategy deployment, yield generation',
        verificationStatus: 'VERIFIED',
        providerId: provider.id,
        explorerLink: 'https://explorer.solana.com/address/SolsticeProvider',
        chainalysisLink: 'https://app.chainalysis.com/address/SolsticeProvider',
      },
      {
        address: '0xDEST...4471',
        controllerName: 'Approved Redemption Wallet',
        controllerType: 'REDEMPTION_WALLET',
        permittedUse: 'Client redemptions, approved destination',
        verificationStatus: 'VERIFIED',
        explorerLink: 'https://explorer.solana.com/address/Dest4471',
      },
    ],
  });
  console.log('Created Wallet Controller Registry (7 entries)');

  // ─── Transfer Checks ─────────────────────
  const now = Date.now();
  await prisma.transferCheck.createMany({
    data: [
      {
        transferId: 'DEP-001',
        transferType: 'DEPOSIT',
        vaultId: 'VLT-001',
        fromAddress: '0xCUST...1188',
        fromController: 'Client INST-2048 Stablecoin Account',
        toAddress: '0xA91F...72C3',
        toController: 'VLT-001 Segregated Vault',
        asset: 'USDC',
        amount: 1000000,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/DEP-001',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/DEP-001',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: Transfer above CHF 1,000 threshold',
        providerApproval: 'NOT_REQUIRED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: null,
        checkedAt: new Date(now - 300000),
        checkedBy: 'System',
      },
      {
        transferId: 'ALLOC-001',
        transferType: 'ALLOCATION',
        vaultId: 'VLT-001',
        fromAddress: '0xA91F...72C3',
        fromController: 'VLT-001 Segregated Vault',
        toAddress: '0xSOLSTICE-PROVIDER-WALLET-0000000000000',
        toController: 'Solstice Finance Provider',
        asset: 'USDC',
        amount: 500000,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/ALLOC-001',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/ALLOC-001',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: VASP-to-Protocol transfer',
        providerApproval: 'APPROVED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi2v7uGnpB3oK1uE6pNWAD8YfN5Rrwh9myxPGQtN9dN3sP',
        checkedAt: new Date(now - 240000),
        checkedBy: 'System',
      },
      {
        transferId: 'YIELD-001',
        transferType: 'DEPOSIT',
        vaultId: 'VLT-001',
        fromAddress: '0xSOLSTICE-PROVIDER-WALLET-0000000000000',
        fromController: 'Solstice Finance Provider',
        toAddress: '0xA91F...72C3',
        toController: 'VLT-001 Segregated Vault',
        asset: 'USDC',
        amount: 2329,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/YIELD-001',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/YIELD-001',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: Provider-to-VASP return',
        providerApproval: 'NOT_REQUIRED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: '3Fj2YxKMab3gKT5qiPgCqRok1YM6vrVSdGrPExVNsQ56Hwc4EJe7GEVU8fwR7LXe7NpFmwQPcAN3TP93ocKJZsFf',
        checkedAt: new Date(now - 180000),
        checkedBy: 'System',
      },
      {
        transferId: 'DEP-002',
        transferType: 'DEPOSIT',
        vaultId: 'VLT-002',
        fromAddress: '0xADBD-TREASURY-ABUDHABI-000000000000000',
        fromController: 'Client INST-3072 Stablecoin Account',
        toAddress: '0xADBD9001ABUDHABI0000000000000000000000',
        toController: 'VLT-002 Segregated Vault',
        asset: 'USDC',
        amount: 500000,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/DEP-002',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/DEP-002',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: Transfer above ADGM threshold',
        providerApproval: 'NOT_REQUIRED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: null,
        checkedAt: new Date(now - 120000),
        checkedBy: 'System',
      },
      {
        transferId: 'ALLOC-002',
        transferType: 'ALLOCATION',
        vaultId: 'VLT-002',
        fromAddress: '0xADBD9001ABUDHABI0000000000000000000000',
        fromController: 'VLT-002 Segregated Vault',
        toAddress: '0xSOLSTICE-PROVIDER-WALLET-0000000000000',
        toController: 'Solstice Finance Provider',
        asset: 'USDC',
        amount: 300000,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/ALLOC-002',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/ALLOC-002',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: VASP-to-Protocol transfer',
        providerApproval: 'APPROVED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: '2QK7voNGBed5EA2LQKQ1GQ3DFsJZaGSmsasH7s1bBXzFWmJJ5u6ByzsPDjKELMfuN7eA4vVPfG7mHM6S9p3hVrY9',
        checkedAt: new Date(now - 100000),
        checkedBy: 'System',
      },
      {
        transferId: 'REDEEM-001',
        transferType: 'REDEMPTION',
        vaultId: 'VLT-001',
        fromAddress: '0xA91F...72C3',
        fromController: 'VLT-001 Segregated Vault',
        toAddress: '0xDEST...4471',
        toController: 'Approved Redemption Wallet',
        asset: 'USDC',
        amount: 50000,
        kytStatus: 'CLEAR',
        kytReference: 'https://app.chainalysis.com/kyt/tx/REDEEM-001',
        ofacStatus: 'CLEAR',
        ofacReference: 'https://app.chainalysis.com/sanctions/REDEEM-001',
        travelRuleStatus: 'COMPLETE',
        travelRuleReference: 'Notabene: Vault-to-Client redemption',
        providerApproval: 'NOT_REQUIRED',
        mandateCheck: 'PASSED',
        overallStatus: 'PASSED',
        txSignature: '5RkXg8RnLqMtPAB3Xf9JLP71yJmgPKmBbUqNPcbpyHLWvWdz8kE9MZuB6hPMp5F3a6VN2r7Xa3PWsYRHGVqBnWX6',
        checkedAt: new Date(now - 60000),
        checkedBy: 'System',
      },
    ],
  });
  console.log('Created Transfer Checks (6 entries)');

  // ─── Compliance Events ─────────────────────────────────────────
  await prisma.complianceEvent.createMany({
    data: [
      { eventId: 'EVT-001', actionType: 'CREDENTIAL_ISSUED', actor: 'admin', role: 'Admin', result: 'success', reason: 'Credential SAS-VAULT-001 issued for INST-2048', timestamp: new Date(now - 300000) },
      { eventId: 'EVT-002', vaultId: vault.vaultId, actionType: 'VAULT_CREATED', actor: 'admin', role: 'Admin', result: 'success', reason: 'Segregated vault VLT-001 created for credential SAS-VAULT-001', timestamp: new Date(now - 240000) },
      { eventId: 'EVT-003', vaultId: vault.vaultId, actionType: 'MANDATE_ATTACHED', actor: 'admin', role: 'Admin', result: 'success', reason: 'Mandate bound to vault VLT-001', timestamp: new Date(now - 180000) },
      { eventId: 'EVT-004', vaultId: vault.vaultId, actionType: 'DEPOSIT_RECORDED', actor: 'operations', role: 'Operations', asset: 'USDC', amount: 1000000, result: 'success', reason: 'Deposit of 1,000,000 USDC recorded. Source: SRC-7781', timestamp: new Date(now - 120000) },
      { eventId: 'EVT-AE-001', vaultId: vault2.vaultId, actionType: 'CREDENTIAL_ISSUED', actor: 'admin@amina.bank', role: 'Admin', result: 'success', reason: 'Credential issued for INST-3072 (Abu Dhabi, ADGM)' },
      { eventId: 'EVT-AE-002', vaultId: vault2.vaultId, actionType: 'VAULT_CREATED', actor: 'admin@amina.bank', role: 'Admin', result: 'success', reason: 'Segregated vault created for INST-3072 (Abu Dhabi)' },
      { eventId: 'EVT-AE-003', vaultId: vault2.vaultId, actionType: 'MANDATE_ATTACHED', actor: 'admin@amina.bank', role: 'Admin', result: 'success', reason: 'Mandate attached: 100% cap, 15% buffer, 100K consent, leverage allowed (Abu Dhabi FSRA rules)' },
      { eventId: 'EVT-AE-004', vaultId: vault2.vaultId, actionType: 'DEPOSIT_RECORDED', actor: 'admin@amina.bank', role: 'Admin', asset: 'USDC', amount: 500000, result: 'success', reason: 'Deposit: 500,000 USDC from ADGM treasury wallet' },
    ],
  });
  console.log('Seeded compliance events');

  // Translation Layer demo events
  const mockPdaBase = '7Xf9r2kBc4mVnPQ8dL3wH5tYjAeZ6Ks1NbCg';
  await prisma.complianceEvent.createMany({
    data: [
      { eventId: 'EVT-TL-001', vaultId: vault.vaultId, actionType: 'TL_PIPELINE_COMPLETE', actor: 'translation_layer', role: 'system', result: 'success', reason: 'Full pipeline: DEPOSIT 1,000,000 USDC — jurisdiction CH, travel rule exempt, routed to Solstice, GL posted', amount: 1000000, asset: 'USDC', translationLayerRef: `${mockPdaBase}InstrLog01aB`, compliancePda: `${mockPdaBase}ComplAttest01`, travelRulePda: `${mockPdaBase}TravelChk01x`, routingPda: `${mockPdaBase}RouteDecis01`, glEntryPda: `${mockPdaBase}GLEntry001ab`, timestamp: new Date(now - 100000) },
      { eventId: 'EVT-TL-002', vaultId: vault.vaultId, actionType: 'TL_COMPLIANCE_PASSED', actor: 'translation_layer', role: 'system', result: 'success', reason: 'Jurisdiction CH (FINMA): compliance attestation passed. Travel rule threshold 1,000 USDC.', amount: 500000, asset: 'USDC', compliancePda: `${mockPdaBase}ComplAttest02`, travelRulePda: `${mockPdaBase}TravelChk02x`, timestamp: new Date(now - 90000) },
      { eventId: 'EVT-TL-003', vaultId: vault.vaultId, actionType: 'TL_VENUE_ROUTED', actor: 'translation_layer', role: 'system', result: 'success', reason: 'Routed to Solstice eUSX Yield Vault via Mesh. Venue eligible, mandate allows.', amount: 500000, asset: 'USDC', routingPda: `${mockPdaBase}RouteDecis02`, timestamp: new Date(now - 85000) },
      { eventId: 'EVT-TL-004', vaultId: vault.vaultId, actionType: 'TL_BOOKED_BACK', actor: 'translation_layer', role: 'system', result: 'success', reason: 'GL entry posted to Finstar. Debit: 5010-STRATEGY-DEPLOYED, Credit: 2010-CLIENT-VLT-001. SWIFT: AMINCHZZXXX.', amount: 500000, asset: 'USDC', glEntryPda: `${mockPdaBase}GLEntry002ab`, timestamp: new Date(now - 80000) },
      { eventId: 'EVT-TL-005', vaultId: vault.vaultId, actionType: 'TL_PIPELINE_COMPLETE', actor: 'translation_layer', role: 'system', result: 'success', reason: 'Full pipeline: ALLOCATE 500,000 USDC to Solstice — all 5 PDAs created on-chain', amount: 500000, asset: 'USDC', translationLayerRef: `${mockPdaBase}InstrLog02aB`, compliancePda: `${mockPdaBase}ComplAttest03`, travelRulePda: `${mockPdaBase}TravelChk03x`, routingPda: `${mockPdaBase}RouteDecis03`, glEntryPda: `${mockPdaBase}GLEntry003ab`, timestamp: new Date(now - 75000) },
    ],
  });
  console.log('Seeded Translation Layer demo events');

  // Translation Layer Instructions (DB-backed pipeline records)
  await prisma.translationLayerInstruction.createMany({
    data: [
      {
        instructionId: 'TL-DEMO-001',
        instructionType: 'DEPOSIT',
        vaultId: vault.vaultId,
        amount: 1000000,
        jurisdiction: 'CH',
        strategyId: 'deposit',
        status: 'complete',
        complianceResult: 'passed',
        complianceRef: 'CA-TL-DEMO-001',
        travelRuleRef: 'TR-TL-DEMO-001',
        travelRuleResult: 'Clear',
        routingRef: 'RT-TL-DEMO-001',
        glEntryRef: 'GL-TL-DEMO-001',
        glEntryType: 'Deposit',
        glDirection: 'credit',
        initiator: 'operations',
        receivedAt: new Date(now - 120000),
        complianceCheckedAt: new Date(now - 110000),
        actionExecutedAt: new Date(now - 100000),
        completedAt: new Date(now - 100000),
      },
      {
        instructionId: 'TL-DEMO-002',
        instructionType: 'ALLOCATE',
        vaultId: vault.vaultId,
        amount: 500000,
        jurisdiction: 'CH',
        strategyId: 'solstice-eusx-yield',
        status: 'complete',
        complianceResult: 'passed',
        complianceRef: 'CA-TL-DEMO-002',
        travelRuleRef: 'TR-TL-DEMO-002',
        travelRuleResult: 'Clear',
        routingRef: 'RT-TL-DEMO-002',
        glEntryRef: 'GL-TL-DEMO-002',
        glEntryType: 'StrategyAllocation',
        glDirection: 'debit',
        initiator: 'portfolio_manager',
        receivedAt: new Date(now - 90000),
        complianceCheckedAt: new Date(now - 85000),
        actionExecutedAt: new Date(now - 75000),
        completedAt: new Date(now - 75000),
      },
      {
        instructionId: 'TL-DEMO-003',
        instructionType: 'DEPOSIT',
        vaultId: vault2.vaultId,
        amount: 500000,
        jurisdiction: 'AE',
        strategyId: 'deposit',
        status: 'complete',
        complianceResult: 'passed',
        complianceRef: 'CA-TL-DEMO-003',
        travelRuleRef: 'TR-TL-DEMO-003',
        travelRuleResult: 'Clear',
        routingRef: 'RT-TL-DEMO-003',
        glEntryRef: 'GL-TL-DEMO-003',
        glEntryType: 'Deposit',
        glDirection: 'credit',
        initiator: 'admin@amina.bank',
        receivedAt: new Date(now - 70000),
        complianceCheckedAt: new Date(now - 65000),
        actionExecutedAt: new Date(now - 60000),
        completedAt: new Date(now - 60000),
      },
    ],
  });
  console.log('Seeded Translation Layer Instructions');

  // GL Entries (L1 persistent journal)
  await prisma.gLEntry.createMany({
    data: [
      {
        entryId: 'GL-TL-DEMO-001',
        vaultId: vault.vaultId,
        instructionId: 'TL-DEMO-001',
        entryType: 'Deposit',
        direction: 'credit',
        amount: 1000000,
        currency: 'USDC',
        debitAccount: 'CLIENT-CUSTODY',
        creditAccount: 'VAULT',
        narrative: 'Deposit of 1,000,000 USDC into vault VLT-001',
        swiftReference: 'AMINCHZZXXX-TL-DEMO-001',
        jurisdiction: 'CH',
        status: 'posted',
        approvedBy: 'compliance@amina.bank',
        approvedAt: new Date(now - 99000),
        postedAt: new Date(now - 99000),
        sourceType: 'translation_layer',
        sourceId: 'TL-DEMO-001',
      },
      {
        entryId: 'GL-TL-DEMO-002',
        vaultId: vault.vaultId,
        instructionId: 'TL-DEMO-002',
        entryType: 'StrategyAllocation',
        direction: 'debit',
        amount: 500000,
        currency: 'USDC',
        debitAccount: 'VAULT',
        creditAccount: 'STRATEGY',
        narrative: 'Allocation of 500,000 USDC to strategy solstice-eusx-yield',
        swiftReference: 'AMINCHZZXXX-TL-DEMO-002',
        jurisdiction: 'CH',
        status: 'posted',
        approvedBy: 'compliance@amina.bank',
        approvedAt: new Date(now - 74000),
        postedAt: new Date(now - 74000),
        sourceType: 'translation_layer',
        sourceId: 'TL-DEMO-002',
      },
      {
        entryId: 'GL-TL-DEMO-003',
        vaultId: vault2.vaultId,
        instructionId: 'TL-DEMO-003',
        entryType: 'Deposit',
        direction: 'credit',
        amount: 500000,
        currency: 'USDC',
        debitAccount: 'CLIENT-CUSTODY',
        creditAccount: 'VAULT',
        narrative: 'Deposit of 500,000 USDC into vault VLT-002 (Abu Dhabi)',
        swiftReference: 'AMINCHZZXXX-TL-DEMO-003',
        jurisdiction: 'AE',
        status: 'pending',
        sourceType: 'translation_layer',
        sourceId: 'TL-DEMO-003',
      },
    ],
  });
  console.log('Seeded GL Entries (2 posted, 1 pending approval)');

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
