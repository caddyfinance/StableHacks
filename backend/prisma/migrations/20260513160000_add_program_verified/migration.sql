-- AlterTable
ALTER TABLE "Vault" ADD COLUMN "programVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vault" ADD COLUMN "programVerifiedAt" TIMESTAMP(3);
