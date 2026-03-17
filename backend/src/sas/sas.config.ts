import bs58 from 'bs58';

export function getSasConfig() {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    rpcWsUrl: (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com').replace('https', 'wss'),
    issuerKeypairBase58: process.env.SAS_ISSUER_KEYPAIR || '',
    credentialPda: process.env.SAS_CREDENTIAL_PDA || '',
    schemaPda: process.env.SAS_SCHEMA_PDA || '',
  };
}

export function getIssuerSecretKey(): Uint8Array {
  const key = process.env.SAS_ISSUER_KEYPAIR;
  if (!key) {
    throw new Error('SAS_ISSUER_KEYPAIR not set in .env');
  }
  return bs58.decode(key);
}
