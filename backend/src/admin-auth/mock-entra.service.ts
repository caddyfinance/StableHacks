import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

interface EntraUser {
  email: string;
  name: string;
  role: string;
  department: string;
}

// Mock Entra ID user directory (simulates Azure AD)
const ENTRA_USERS: Record<string, EntraUser> = {
  'admin@amina.bank': { email: 'admin@amina.bank', name: 'Sarah Chen', role: 'admin', department: 'Digital Assets' },
  'pm@amina.bank': { email: 'pm@amina.bank', name: 'Marcus Weber', role: 'portfolio_manager', department: 'Portfolio Management' },
  'compliance@amina.bank': { email: 'compliance@amina.bank', name: 'Elena Rossi', role: 'compliance_officer', department: 'Compliance & Risk' },
  'emergency@amina.bank': { email: 'emergency@amina.bank', name: 'James Park', role: 'emergency_admin', department: 'Operations' },
};

// Simulates SAML/OIDC auth codes
const pendingCodes: Map<string, string> = new Map();

@Injectable()
export class MockEntraService {
  getAvailableUsers() {
    return Object.values(ENTRA_USERS).map(u => ({
      email: u.email,
      name: u.name,
      role: u.role,
      department: u.department,
    }));
  }

  generateAuthCode(email: string): { code: string; loginUrl: string } | null {
    const user = ENTRA_USERS[email];
    if (!user) return null;

    const code = uuid();
    pendingCodes.set(code, email);

    // In production this would be an Azure AD redirect URL
    return {
      code,
      loginUrl: `/api/admin-auth/entra/callback?code=${code}`,
    };
  }

  validateCallback(code: string): EntraUser | null {
    const email = pendingCodes.get(code);
    if (!email) return null;

    pendingCodes.delete(code);
    return ENTRA_USERS[email] || null;
  }
}
