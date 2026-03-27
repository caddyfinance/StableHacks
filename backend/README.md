# AMINA Vault — Backend

NestJS API server that manages credentials, vaults, strategies, consent, and compliance events. Interacts with the Solana blockchain for on-chain operations and the Solstice protocol for yield strategies.

## Prerequisites

- **Node.js 18+**
- **PostgreSQL** running locally (or a remote connection string)
- **npm** (comes with Node.js)

## Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate
```

## Database Setup

```bash
# Create the database (if it doesn't exist)
createdb amina_vault

# Push the schema to the database
npx prisma db push

# Seed with demo data (credentials, vaults, strategies, mandates)
npm run db:seed
```

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database
DATABASE_URL="postgresql://your_user@localhost:5432/amina_vault?schema=public"

# Server port
PORT=3210

# Solana
SOLANA_RPC_URL=https://rpc.ankr.com/solana_devnet/your_api_key

# Solana Attestation Service (SAS)
SAS_ISSUER_KEYPAIR=your_keypair_base58
SAS_CREDENTIAL_PDA=your_credential_pda
SAS_SCHEMA_PDA=your_schema_pda

# AMINA Vault Program (Anchor)
AMINA_PROGRAM_ID=
AMINA_BANK_KEYPAIR=

# Solstice eUSX Yield Protocol
USX_API_URL=https://instructions.solstice.finance
USX_API_KEY=your_api_key

```

## Running

```bash
# Development (watch mode with hot reload)
npm run dev

# Production build
npm run build

# Production start
npm run start:prod
```

The server starts at **http://localhost:3210**.

Swagger API docs are available at **http://localhost:3210/api**.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start in watch mode (hot reload) |
| `npm run build` | Build for production (Prisma generate + NestJS compile) |
| `npm run start` | Start without building |
| `npm run start:prod` | Start the production build |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio (visual database browser) |
| `npm run sas:setup` | Set up SAS issuer credentials and schemas |
| `npm run sas:revoke` | Revoke SAS credentials |

## Docker

Build and run with Docker:

```bash
# Build the image
docker build -t amina-vault-backend .

# Run (pass your DATABASE_URL and other env vars)
docker run -p 3210:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e SOLANA_RPC_URL="https://..." \
  -e SAS_ISSUER_KEYPAIR="..." \
  -e AMINA_PROGRAM_ID="5uPg5pi46gXErKcYWyqEAn2uSU68VZSUgvGTPZuVGwyA" \
  amina-vault-backend
```

The Docker image automatically runs `prisma db push` on startup to apply any pending schema changes.

## Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Entry point, Swagger setup
│   ├── app.module.ts           # Root module
│   ├── admin-auth/             # Microsoft Entra ID authentication
│   ├── auth/                   # Role-based access guard
│   ├── credentials/            # SAS credential issuance and revocation
│   ├── vaults/                 # Vault creation and management
│   ├── strategies/             # Yield strategy configuration
│   ├── consent/                # Consent-gated approvals
│   ├── events/                 # Compliance event logging
│   ├── vault-program/          # On-chain Solana program interactions
│   ├── solstice/               # Solstice eUSX yield protocol
│   ├── sas/                    # SAS credential service
│   ├── prisma/                 # Prisma database module
│   └── health/                 # Health check endpoint
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Demo data seeder
├── scripts/
│   ├── sas-setup.ts            # SAS issuer setup script
│   └── sas-revoke.ts           # SAS credential revocation script
├── Dockerfile                  # Production Docker image
└── .env                        # Environment variables
```

## Troubleshooting

**Database connection failed:**
Make sure PostgreSQL is running and `DATABASE_URL` in `.env` matches your setup. Run `createdb amina_vault` if the database doesn't exist.

**Prisma errors after schema change:**
Run `npx prisma db push` to sync the schema, then `npx prisma generate` to regenerate the client.

**SAS operations failing:**
Run `npm run sas:setup` to initialize the SAS issuer credentials and schema on Solana devnet.
