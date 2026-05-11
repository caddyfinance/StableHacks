-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "clientReference" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "riskTier" TEXT NOT NULL,
    "productEligibility" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "attestationPda" TEXT,
    "attestationTxSig" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "clientReference" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "baseAsset" TEXT NOT NULL DEFAULT 'USDC',
    "status" TEXT NOT NULL DEFAULT 'active',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "idleBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNAV" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vaultAttestationPda" TEXT,
    "vaultAttestationTxSig" TEXT,
    "onChainAddress" TEXT,
    "programId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "allowedStrategies" TEXT[],
    "blockedStrategies" TEXT[],
    "maxAllocationBps" JSONB NOT NULL,
    "liquidityBufferBps" INTEGER NOT NULL DEFAULT 1000,
    "consentThreshold" DOUBLE PRECISION NOT NULL DEFAULT 250000,
    "leverageAllowed" BOOLEAN NOT NULL DEFAULT false,
    "approvedDestinations" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastUpdatedBy" TEXT,
    "onChainSynced" BOOLEAN NOT NULL DEFAULT false,
    "onChainSyncTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateRule" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "onChainSync" BOOLEAN NOT NULL DEFAULT false,
    "onChainTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MandateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "currentYield" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "yieldAccrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "txSignature" TEXT,
    "onChainAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sourceWallet" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'Approved Custody-Linked Wallet',
    "screeningStatus" TEXT NOT NULL DEFAULT 'Clear',
    "jurisdictionTag" TEXT NOT NULL DEFAULT 'CH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "initiator" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consentedBy" TEXT,
    "consentedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vaultId" TEXT,
    "actionType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "asset" TEXT,
    "amount" DOUBLE PRECISION,
    "strategy" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "txSignature" TEXT,
    "onChainAddress" TEXT,
    "translationLayerRef" TEXT,
    "compliancePda" TEXT,
    "travelRulePda" TEXT,
    "routingPda" TEXT,
    "glEntryPda" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "bankBalance" DOUBLE PRECISION NOT NULL DEFAULT 50000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "bankReviewStatus" TEXT NOT NULL DEFAULT 'Completed',
    "providerType" TEXT NOT NULL DEFAULT 'Approved External Yield Provider',
    "kytStatus" TEXT NOT NULL DEFAULT 'Clear',
    "ofacSanctionsStatus" TEXT NOT NULL DEFAULT 'Clear',
    "travelRuleTreatment" TEXT NOT NULL DEFAULT 'External transfer edge review applied where applicable',
    "protocolDueDiligence" TEXT NOT NULL DEFAULT 'Completed',
    "mandateFit" TEXT[],
    "exposureLimit" INTEGER NOT NULL DEFAULT 60,
    "lastReviewDate" TIMESTAMP(3) NOT NULL,
    "nextReviewDate" TIMESTAMP(3) NOT NULL,
    "reviewNotes" TEXT,
    "evidencePackUrl" TEXT,
    "jurisdictionTreatment" TEXT NOT NULL DEFAULT 'Bank-reviewed',
    "clientEligibility" TEXT NOT NULL DEFAULT 'Institutional only',
    "vaultEligibility" TEXT[],
    "destinationWallet" TEXT NOT NULL DEFAULT 'Approved',
    "kytScreeningRequired" BOOLEAN NOT NULL DEFAULT true,
    "ofacScreeningRequired" BOOLEAN NOT NULL DEFAULT true,
    "travelRuleRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderMonitoringSnapshot" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "bankApprovalStatus" TEXT NOT NULL DEFAULT 'Approved',
    "strategyStatus" TEXT NOT NULL DEFAULT 'Available',
    "contractMonitoring" TEXT NOT NULL DEFAULT 'No new critical event',
    "kytExposure" TEXT NOT NULL DEFAULT 'Clear',
    "ofacStatus" TEXT NOT NULL DEFAULT 'Clear',
    "liquidityStatus" TEXT NOT NULL DEFAULT 'Within approved range',
    "reviewStatus" TEXT NOT NULL DEFAULT 'Current',
    "lastReviewed" TIMESTAMP(3) NOT NULL,
    "nextReview" TIMESTAMP(3) NOT NULL,
    "alerts" JSONB,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMonitoringSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferCheck" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromController" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "toController" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "amount" DOUBLE PRECISION NOT NULL,
    "kytStatus" TEXT NOT NULL DEFAULT 'CLEAR',
    "kytReference" TEXT,
    "ofacStatus" TEXT NOT NULL DEFAULT 'CLEAR',
    "ofacReference" TEXT,
    "travelRuleStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "travelRuleReference" TEXT,
    "providerApproval" TEXT,
    "mandateCheck" TEXT,
    "overallStatus" TEXT NOT NULL DEFAULT 'PASSED',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedBy" TEXT,

    CONSTRAINT "TransferCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletController" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "controllerName" TEXT NOT NULL,
    "controllerType" TEXT NOT NULL,
    "permittedUse" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "chainalysisLink" TEXT,
    "explorerLink" TEXT,
    "vaultId" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletController_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Credential_credentialId_key" ON "Credential"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_vaultId_key" ON "Vault"("vaultId");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_vaultId_key" ON "Mandate"("vaultId");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_strategyId_key" ON "Strategy"("strategyId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRequest_requestId_key" ON "ConsentRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceEvent_eventId_key" ON "ComplianceEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WalletController_address_key" ON "WalletController"("address");

-- AddForeignKey
ALTER TABLE "Vault" ADD CONSTRAINT "Vault_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("credentialId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateRule" ADD CONSTRAINT "MandateRule_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("strategyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("vaultId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderMonitoringSnapshot" ADD CONSTRAINT "ProviderMonitoringSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
