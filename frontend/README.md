# AMINA Vault — Frontend

React application with two portals: the AMINA Administration console for bank teams and the Client Portal for institutional clients. Built with Vite, Tailwind CSS, and Solana wallet integration.

## Prerequisites

- **Node.js 18+**
- **npm** (comes with Node.js)
- **Backend running** at http://localhost:3210 (see `backend/README.md`)

## Installation

```bash
# Install dependencies
npm install
```

## Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
# Backend API URL
VITE_API_URL=http://localhost:3210

# Frontend port
VITE_APP_PORT=3333

# Solana RPC (for wallet balance lookups)
VITE_SOLANA_RPC_URL=https://rpc.ankr.com/solana_devnet/your_api_key
```

## Running

```bash
# Development server (hot reload)
npm run dev
```

Opens at **http://localhost:3333**.

The dev server proxies `/api` requests to the backend URL, so the backend must be running.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview the production build locally |

## Production Build

```bash
# Build for production
npm run build

# Preview the build
npm run preview
```

The build output goes to `dist/`. This is a static site that can be deployed to any static hosting (Netlify, Vercel, S3, etc.).

For production, set `VITE_API_URL` to your deployed backend URL before building.

## Using the App

### Admin Portal

1. Go to http://localhost:3333
2. Click **AMINA Administration**
3. Select a role (Admin, Portfolio Manager, Compliance Officer, or Emergency Admin)
4. Click **Sign in with Microsoft Entra ID** (demo mode, no real Entra ID needed)

### Client Portal

1. Go to http://localhost:3333
2. Click **Client Portal**
3. Connect a Solana wallet or use the **Demo Login**
4. If your wallet has a bound SAS credential, you'll see your vault data

### Demo Mode

Both portals support demo login — no real wallet or Entra ID account is needed. The backend seeds demo credentials, vaults, and strategies when you run `npm run db:seed`.

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx                 # Routing and role-based access control
│   ├── main.tsx                # React entry point
│   ├── pages/
│   │   ├── LandingPage.tsx     # Public landing page
│   │   ├── LoginPage.tsx       # Admin and client login
│   │   ├── CredentialsPage.tsx # Issue SAS credentials
│   │   ├── VaultFactoryPage.tsx# Create segregated vaults
│   │   ├── MandatePage.tsx     # View investment mandates
│   │   ├── FundingPage.tsx     # Fund tracking and settlement
│   │   ├── ExecutionPage.tsx   # Capital allocation controls
│   │   ├── CompliancePage.tsx  # Compliance dashboard
│   │   ├── EmergencyPage.tsx   # Pause, disable, unwind
│   │   ├── admin/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── AuditLogPage.tsx
│   │   │   └── TransparencyPage.tsx
│   │   └── client/
│   │       ├── VaultOverviewPage.tsx
│   │       ├── MyVaultsPage.tsx
│   │       ├── VaultDetailPage.tsx
│   │       ├── RequestCredentialPage.tsx
│   │       ├── ClientMandatePage.tsx
│   │       ├── ConsentPage.tsx
│   │       ├── RampPage.tsx
│   │       ├── ActivityPage.tsx
│   │       └── RedemptionPage.tsx
│   ├── components/
│   │   ├── AdminLayout.tsx     # Admin sidebar and navigation
│   │   ├── ClientLayout.tsx    # Client sidebar and navigation
│   │   ├── WalletProvider.tsx  # Solana wallet adapter setup
│   │   └── ...
│   └── store/
│       └── useStore.ts         # Zustand state management
├── index.html
├── vite.config.ts              # Vite config with API proxy
├── tailwind.config.js          # Tailwind CSS config
└── .env                        # Environment variables
```

## Troubleshooting

**Blank page or API errors:**
Make sure the backend is running at the URL specified in `VITE_API_URL`. The frontend proxies all `/api` calls to this address.

**Wallet not connecting:**
The app is configured for Solana Devnet. Make sure your wallet (Phantom, Solflare, etc.) is set to Devnet.

**Build errors:**
Run `npm install` to make sure all dependencies are installed. If TypeScript errors persist, check that you're using Node.js 18+.
