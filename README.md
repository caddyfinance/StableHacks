# AMINA Institutional Segregated Yield Vault

A bank-ready, segregated institutional control framework for yield deployment on Solana.

## Architecture

```
frontend/     — React + TypeScript + Vite + Tailwind (port 3000)
backend/      — NestJS + TypeScript + Prisma + PostgreSQL (port 3001)
contracts/    — Solana Anchor programs (Rust)
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- (Optional) Rust + Anchor CLI for contract development

### 1. Backend Setup

```bash
cd backend
npm install
npx prisma generate

# Create the database
createdb amina_vault

# Push schema to database
npx prisma db push

# Seed demo data
npm run db:seed

# Start the backend
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### 3. Demo Flow

1. **Credentials** — Issue a SAS-compatible credential for INST-2048
2. **Vault Factory** — Create a segregated vault bound to the credential
3. **Mandate Config** — Attach conservative mandate (60% stablecoin, 40% treasury, 0% high-yield)
4. **Vault Funding** — Deposit 1,000,000 USDC from approved source
5. **Execution** — Attempt blocked strategy (fail) then approved strategy (success)
6. **Compliance** — View audit trail and vault snapshot
7. **Client Actions** — Approve consent-gated reallocation, execute redemption
8. **Emergency** — Pause vault, disable adapter, unwind positions

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/credentials | List all credentials |
| POST | /api/credentials | Issue new credential |
| PUT | /api/credentials/:id/revoke | Revoke credential |
| GET | /api/vaults | List all vaults |
| POST | /api/vaults | Create vault |
| GET | /api/vaults/:id/snapshot | Get vault snapshot |
| POST | /api/vaults/:id/mandate | Attach mandate |
| POST | /api/vaults/:id/deposit | Deposit funds |
| POST | /api/vaults/:id/allocate | Allocate to strategy |
| POST | /api/vaults/:id/redeem | Redeem funds |
| POST | /api/vaults/:id/unwind | Unwind strategy |
| POST | /api/vaults/:id/pause | Toggle pause |
| GET | /api/strategies | List strategies |
| PUT | /api/strategies/:id/disable | Toggle strategy |
| GET | /api/consent | List consent requests |
| PUT | /api/consent/:id/approve | Approve consent |
| GET | /api/events | List compliance events |
