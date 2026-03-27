# AMINA Institutional Segregated Yield Vault

A bank-grade platform for institutional yield management on Solana. Each institution gets a segregated, non-pooled vault with on-chain identity verification, investment mandates, consent-gated approvals, and a full compliance audit trail.

## What's Inside

```
frontend/     — React + Vite + Tailwind CSS (port 3333)
backend/      — NestJS + Prisma + PostgreSQL (port 3210)
contracts/    — Solana Anchor program (Rust)
```

## Prerequisites

- Node.js 18+
- PostgreSQL running locally
- (Optional) Rust + Anchor CLI for smart contract development

## Quick Start

### 1. Backend

```bash
cd backend
npm install

# Create the database
createdb amina_vault

# Push schema and seed demo data
npx prisma db push
npm run db:seed

# Start the backend
npm run dev
```

Backend runs at **http://localhost:3210**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3333**

### 3. Try the Demo

1. Open http://localhost:3333
2. Click **AMINA Administration** and log in as Admin
3. **Credentials** — Issue a SAS credential for a client wallet
4. **Vault Factory** — Create a segregated vault for the client
5. **Mandate** — View the investment constraints bound to the vault
6. **Funding** — Deposit USDC into the vault
7. **Execution** — Log in as Portfolio Manager, allocate to yield strategies
8. **Compliance** — Log in as Compliance Officer, review the audit trail
9. **Client Portal** — Log in as Client, approve consent requests, view activity
10. **Emergency** — Log in as Emergency Admin, pause vault or unwind positions

## Two Portals, Five Roles

### AMINA Administration Portal

| Role | Access |
|------|--------|
| **Admin** | Full access — credentials, vault factory, funding, compliance, audit log, transparency |
| **Portfolio Manager** | Deploy/withdraw capital, view mandates and compliance |
| **Compliance Officer** | Read-only compliance dashboard and event logs |
| **Emergency Admin** | Pause vaults, disable strategies, unwind positions |

### Client Portal

| Role | Access |
|------|--------|
| **Client** | Portfolio overview, vault details, deposits/withdrawals, consent approvals, on/off-ramp, activity log |

## Key Features

- **Segregated Vaults** — One vault per institution, funds never pooled
- **On-Chain Identity (SAS)** — Solana Attestation Service credentials verified before every operation
- **Investment Mandates** — Strategy limits, consent thresholds, leverage controls, approved destinations
- **Consent Gates** — Client must approve transactions above their threshold
- **Compliance Audit Trail** — Every action logged with actor, role, result, and on-chain tx links
- **Enterprise SSO** — Microsoft Entra ID authentication for admin users
- **On/Off-Ramp** — Convert between fiat (USD) and USDC within the platform
- **Yield Strategies** — Solstice eUSX protocol integration with real-time position tracking
- **Emergency Controls** — Instant vault pause, strategy disable, and position unwind
- **PDF/CSV Export** — Generate compliance reports and activity logs

## Smart Contract

Built with Anchor 0.29.0. Handles vault creation, credential registration, deposits, allocations, redemptions, pause/unwind — all verified against SAS attestations on-chain.

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/credentials | Issue new credential |
| PUT | /api/credentials/:id/revoke | Revoke credential |
| POST | /api/vaults | Create vault |
| GET | /api/vaults/:id/snapshot | Get vault snapshot |
| POST | /api/vaults/:id/mandate | Attach mandate |
| POST | /api/vaults/:id/deposit | Deposit funds |
| POST | /api/vaults/:id/allocate | Allocate to strategy |
| POST | /api/vaults/:id/redeem | Redeem funds |
| POST | /api/vaults/:id/unwind | Unwind strategy |
| POST | /api/vaults/:id/pause | Toggle pause |
| GET | /api/strategies | List strategies |
| GET | /api/consent | List consent requests |
| PUT | /api/consent/:id/approve | Approve consent |
| GET | /api/events | List compliance events |

Full Swagger docs available at http://localhost:3210/api when backend is running.

## Deployment

- **Backend:** Docker image (Node 20 + Solana CLI), deployed on Railway
- **Frontend:** Static build, deployed on Netlify
- **Database:** PostgreSQL with Prisma ORM
- **Blockchain:** Solana Devnet

See `backend/README.md` and `frontend/README.md` for detailed setup instructions.
