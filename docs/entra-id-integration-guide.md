# Microsoft Entra ID Integration Guide

**Scope:** Replacing the mock Entra ID adapter with a real Microsoft Entra ID (Azure AD) integration for AMINA Vault admin authentication.

**Current state:** The backend uses `MockEntraService` which simulates SAML 2.0 federation with hardcoded users and in-memory auth codes.

**Target state:** Real Entra ID integration using SAML 2.0 or OpenID Connect (OIDC), with MFA, group-based role mapping, and enterprise SSO.

---

## 1. Architecture overview

```
                    ┌──────────────────────────┐
                    │   Microsoft Entra ID      │
                    │   (Azure AD Tenant)       │
                    │                           │
                    │  ┌─────────────────────┐  │
                    │  │ Enterprise App       │  │
                    │  │ "AMINA Vault Admin"  │  │
                    │  │                      │  │
                    │  │ - SAML 2.0 or OIDC   │  │
                    │  │ - Groups → Roles     │  │
                    │  │ - MFA enforced       │  │
                    │  └─────────────────────┘  │
                    └────────┬─────────┬────────┘
                             │         │
                   SAML/OIDC │         │ Token/Assertion
                    Redirect │         │ Callback
                             ▼         ▼
┌──────────┐    ┌─────────────────────────────────┐    ┌────────────┐
│ Frontend │───>│  AMINA Backend                   │───>│ Prisma DB  │
│ (React)  │    │                                  │    │ adminUser  │
│          │<───│  POST /api/admin-auth/entra/login │    │            │
│          │    │  POST /api/admin-auth/entra/callback│  │            │
└──────────┘    └─────────────────────────────────┘    └────────────┘
```

---

## 2. Prerequisites

### 2.1 Azure portal setup

1. Sign in to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **Enterprise Applications**
3. Click **New Application** > **Create your own application**
4. Name: `AMINA Vault Administration`
5. Select: **Integrate any other application you don't find in the gallery (Non-gallery)**

### 2.2 Choose a protocol

| Protocol | Best for | Complexity |
|----------|----------|------------|
| **OIDC (recommended)** | Modern web apps, NestJS has mature libraries | Lower |
| **SAML 2.0** | Enterprise compliance requirements, legacy IdP chaining | Higher |

This guide covers both options.

---

## 3. Option A: OpenID Connect (OIDC) — Recommended

### 3.1 Register the application in Entra ID

1. Go to **App registrations** > **New registration**
2. Configure:
   - **Name:** `AMINA Vault Admin`
   - **Supported account types:** Single tenant (this organization only)
   - **Redirect URI:** `https://your-domain.com/api/admin-auth/entra/callback` (Web)
3. Note these values:
   - **Application (client) ID** → `ENTRA_CLIENT_ID`
   - **Directory (tenant) ID** → `ENTRA_TENANT_ID`
4. Go to **Certificates & secrets** > **New client secret**
   - Note the secret value → `ENTRA_CLIENT_SECRET`

### 3.2 Configure API permissions

1. **Microsoft Graph** > **Delegated permissions**:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
   - `GroupMember.Read.All` (for role mapping)
2. Click **Grant admin consent**

### 3.3 Configure groups for role mapping

Create security groups in Entra ID that map to AMINA roles:

| Entra ID Group | AMINA Role |
|----------------|------------|
| `AMINA-BankAdmins` | `admin` |
| `AMINA-PortfolioManagers` | `portfolio_manager` |
| `AMINA-ComplianceOfficers` | `compliance_officer` |
| `AMINA-EmergencyAdmins` | `emergency_admin` |

In the App registration:
1. Go to **Token configuration** > **Add groups claim**
2. Select **Security groups**
3. For ID tokens, set **Group ID**

### 3.4 Environment variables

Add to `.env` (or Railway environment variables):

```env
# Microsoft Entra ID (OIDC)
ENTRA_TENANT_ID=your-tenant-id
ENTRA_CLIENT_ID=your-client-id
ENTRA_CLIENT_SECRET=your-client-secret
ENTRA_REDIRECT_URI=https://your-domain.com/api/admin-auth/entra/callback

# Group → Role mapping (Entra group object IDs)
ENTRA_GROUP_ADMIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_PORTFOLIO_MANAGER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_COMPLIANCE_OFFICER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_EMERGENCY_ADMIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3.5 Install dependencies

```bash
cd backend
npm install @azure/msal-node passport passport-azure-ad
npm install -D @types/passport
```

### 3.6 Create the real Entra service

Replace `mock-entra.service.ts` with `entra.service.ts`:

```typescript
// backend/src/admin-auth/entra.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  ConfidentialClientApplication,
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
  Configuration,
} from '@azure/msal-node';

interface EntraUser {
  email: string;
  name: string;
  role: string;
  department: string;
  groups: string[];
}

@Injectable()
export class EntraService {
  private readonly logger = new Logger(EntraService.name);
  private msalClient: ConfidentialClientApplication;

  // Group ID → AMINA role mapping
  private readonly groupRoleMap: Record<string, string>;

  constructor() {
    const msalConfig: Configuration = {
      auth: {
        clientId: process.env.ENTRA_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
        clientSecret: process.env.ENTRA_CLIENT_SECRET!,
      },
    };

    this.msalClient = new ConfidentialClientApplication(msalConfig);

    this.groupRoleMap = {
      [process.env.ENTRA_GROUP_ADMIN!]: 'admin',
      [process.env.ENTRA_GROUP_PORTFOLIO_MANAGER!]: 'portfolio_manager',
      [process.env.ENTRA_GROUP_COMPLIANCE_OFFICER!]: 'compliance_officer',
      [process.env.ENTRA_GROUP_EMERGENCY_ADMIN!]: 'emergency_admin',
    };
  }

  /**
   * Generate the Entra ID authorization URL.
   * The frontend should redirect the user to this URL.
   */
  async getAuthorizationUrl(): Promise<{ loginUrl: string }> {
    const authUrlParams: AuthorizationUrlRequest = {
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      redirectUri: process.env.ENTRA_REDIRECT_URI!,
      prompt: 'select_account',
    };

    const loginUrl = await this.msalClient.getAuthCodeUrl(authUrlParams);
    return { loginUrl };
  }

  /**
   * Exchange the authorization code for tokens and extract user info.
   * Called when Entra ID redirects back with ?code=...
   */
  async handleCallback(code: string): Promise<EntraUser> {
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      redirectUri: process.env.ENTRA_REDIRECT_URI!,
    };

    const response = await this.msalClient.acquireTokenByCode(tokenRequest);

    // Extract claims from the ID token
    const claims = response.idTokenClaims as Record<string, any>;
    const email = claims.preferred_username || claims.email || '';
    const name = claims.name || '';
    const groups: string[] = claims.groups || [];

    // Map Entra groups to AMINA role
    const role = this.resolveRole(groups);

    this.logger.log(`Entra ID login: ${email} (${name}), role=${role}`);

    return {
      email,
      name,
      role,
      department: claims.department || '',
      groups,
    };
  }

  /**
   * Map Entra security group IDs to AMINA vault roles.
   * First matching group wins. Falls back to read-only if no match.
   */
  private resolveRole(groups: string[]): string {
    // Priority order: admin > emergency > compliance > portfolio
    const priorityOrder = [
      process.env.ENTRA_GROUP_ADMIN!,
      process.env.ENTRA_GROUP_EMERGENCY_ADMIN!,
      process.env.ENTRA_GROUP_COMPLIANCE_OFFICER!,
      process.env.ENTRA_GROUP_PORTFOLIO_MANAGER!,
    ];

    for (const groupId of priorityOrder) {
      if (groups.includes(groupId) && this.groupRoleMap[groupId]) {
        return this.groupRoleMap[groupId];
      }
    }

    return 'compliance_officer'; // default read-only role
  }
}
```

### 3.7 Update AdminAuthService

```typescript
// Modify admin-auth.service.ts

import { EntraService } from './entra.service';
// Replace MockEntraService with EntraService

constructor(
  @Inject(PrismaService) prisma: PrismaService,
  @Inject(EntraService) entra: EntraService,  // <-- changed
) { ... }

// Update initiateEntraLogin to return the real Azure redirect URL
async initiateEntraLogin(email: string) {
  return this.entra.getAuthorizationUrl();
}

// Update validateEntraCallback to handle real tokens
async validateEntraCallback(code: string) {
  const entraUser = await this.entra.handleCallback(code);

  // Ensure user exists in our DB
  let dbUser = await this.prisma.adminUser.findUnique({
    where: { email: entraUser.email },
  });

  // Auto-provision on first login (optional)
  if (!dbUser) {
    dbUser = await this.prisma.adminUser.create({
      data: {
        email: entraUser.email,
        name: entraUser.name,
        role: entraUser.role,
        password: '', // no password needed with Entra
        active: true,
      },
    });
  }

  return {
    authenticated: true,
    provider: 'entra_id',
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      department: entraUser.department,
    },
  };
}
```

### 3.8 Update the module

```typescript
// admin-auth.module.ts
import { EntraService } from './entra.service';

@Module({
  providers: [AdminAuthService, EntraService],  // <-- replace MockEntraService
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
```

### 3.9 Frontend changes

The frontend login flow changes slightly for real Entra ID:

```typescript
// Current (mock): Two API calls in sequence
const initResult = await api.initiateEntraLogin(email);
const callbackResult = await api.validateEntraCallback(initResult.code);

// Real Entra: Redirect-based flow
const { loginUrl } = await api.initiateEntraLogin(email);
window.location.href = loginUrl;  // browser redirects to Microsoft login

// Then handle the callback on a separate route/page:
// The backend receives ?code=... and exchanges it for tokens
```

You'll need a callback handler page or adjust the backend callback to redirect back to the frontend with the session:

```typescript
// Option: Backend redirects back to frontend after auth
@Get('entra/callback')
async entraCallback(@Query('code') code: string, @Res() res: Response) {
  const result = await this.service.validateEntraCallback(code);
  // Redirect to frontend with a session token
  res.redirect(`/login/amina?token=${encodeURIComponent(JSON.stringify(result))}`);
}
```

---

## 4. Option B: SAML 2.0

### 4.1 Configure SAML in Entra ID

1. Go to **Enterprise Applications** > your app > **Single sign-on**
2. Select **SAML**
3. Configure:
   - **Identifier (Entity ID):** `https://your-domain.com/amina-vault`
   - **Reply URL (ACS):** `https://your-domain.com/api/admin-auth/saml/callback`
   - **Sign-on URL:** `https://your-domain.com/login/amina`
4. Under **Attributes & Claims**, map:
   - `emailaddress` → `user.mail`
   - `displayname` → `user.displayname`
   - `groups` → `user.groups`
5. Download the **Federation Metadata XML** or note:
   - **Login URL** → `SAML_SSO_URL`
   - **Azure AD Identifier** → `SAML_ISSUER`
   - **Certificate (Base64)** → `SAML_CERT`

### 4.2 Install dependencies

```bash
npm install @node-saml/passport-saml passport
npm install -D @types/passport
```

### 4.3 Environment variables

```env
# SAML 2.0
SAML_ENTRY_POINT=https://login.microsoftonline.com/{tenant}/saml2
SAML_ISSUER=https://sts.windows.net/{tenant}/
SAML_CERT=MIIC8DCC...base64-cert...
SAML_CALLBACK_URL=https://your-domain.com/api/admin-auth/saml/callback
SAML_ENTITY_ID=https://your-domain.com/amina-vault
```

### 4.4 SAML service implementation

```typescript
// backend/src/admin-auth/saml.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { SAML } from '@node-saml/node-saml';

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);
  private saml: SAML;

  constructor() {
    this.saml = new SAML({
      entryPoint: process.env.SAML_ENTRY_POINT!,
      issuer: process.env.SAML_ENTITY_ID!,
      cert: process.env.SAML_CERT!,
      callbackUrl: process.env.SAML_CALLBACK_URL!,
      wantAuthnResponseSigned: true,
      wantAssertionsSigned: true,
    });
  }

  async getLoginUrl(): Promise<string> {
    const url = await this.saml.getAuthorizeUrlAsync('', '', {});
    return url;
  }

  async validateResponse(samlResponse: string) {
    const { profile } = await this.saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    return {
      email: profile!.nameID,
      name: profile!['displayname'] as string || '',
      groups: (profile!['groups'] as string || '').split(','),
    };
  }
}
```

---

## 5. Security considerations

### 5.1 Token validation

- Always validate the token/assertion **signature** against Microsoft's public key
- Check the **issuer** matches your tenant
- Verify the **audience** matches your application's client ID
- Enforce **token expiry** — reject expired tokens

### 5.2 MFA enforcement

In Entra ID:
1. Go to **Security** > **Conditional Access**
2. Create a policy:
   - **Users:** All AMINA Vault users
   - **Cloud apps:** AMINA Vault Admin
   - **Grant:** Require MFA
   - **Session:** Sign-in frequency = 8 hours

### 5.3 Role escalation prevention

- Map roles from Entra ID groups **server-side only** — never trust the frontend
- Log all role assignments in the audit trail
- Use Conditional Access to restrict emergency_admin to specific network locations

### 5.4 Session management

```typescript
// Recommended: Issue a short-lived JWT after Entra validation
import * as jwt from 'jsonwebtoken';

const sessionToken = jwt.sign(
  { userId: dbUser.id, role: dbUser.role, email: dbUser.email },
  process.env.JWT_SECRET!,
  { expiresIn: '8h' },
);
```

---

## 6. Migration checklist

- [ ] Register application in Azure portal
- [ ] Configure redirect URIs for all environments (local, staging, production)
- [ ] Create security groups and assign users
- [ ] Set environment variables (`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, etc.)
- [ ] Install `@azure/msal-node` (OIDC) or `@node-saml/passport-saml` (SAML)
- [ ] Replace `MockEntraService` with `EntraService` or `SamlService`
- [ ] Update `AdminAuthModule` provider registration
- [ ] Update frontend login flow to handle browser redirect
- [ ] Add callback route/page for handling the redirect response
- [ ] Configure Conditional Access policy for MFA
- [ ] Test with a real Entra ID tenant
- [ ] Disable legacy password login in production
- [ ] Add session token (JWT) issuance after successful auth
- [ ] Set up token refresh for long-running sessions

---

## 7. Testing with a free Entra ID tenant

You can test with a free Azure AD tenant:

1. Go to [Azure Free Account](https://azure.microsoft.com/free/)
2. Create a new tenant in Entra ID
3. Add test users and groups
4. Register the AMINA Vault application
5. Use the development redirect URI: `http://localhost:3210/api/admin-auth/entra/callback`

---

## 8. Keeping the mock for development

You can conditionally switch between mock and real Entra:

```typescript
// admin-auth.module.ts
const EntraProvider = process.env.ENTRA_CLIENT_ID
  ? EntraService
  : MockEntraService;

@Module({
  providers: [AdminAuthService, { provide: 'ENTRA_SERVICE', useClass: EntraProvider }],
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
```

This lets developers run locally with the mock while production uses real Entra ID.
