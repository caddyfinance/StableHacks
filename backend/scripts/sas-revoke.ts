/**
 * SAS Revoke Script
 *
 * Usage:
 *   npm run sas:revoke <attestation-pda>
 *   npm run sas:revoke -- --wallet <wallet-address>
 *   npm run sas:revoke -- --all
 *
 * Closes (revokes) SAS attestation accounts on devnet.
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes,
  address, pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, sendAndConfirmTransactionFactory,
} from '@solana/kit';
import {
  getCloseAttestationInstruction, deriveAttestationPda,
} from 'sas-lib';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const RPC_WS_URL = RPC_URL.replace('https', 'wss');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run sas:revoke <attestation-pda>');
    console.log('  npm run sas:revoke -- --wallet <wallet-address>');
    console.log('  npm run sas:revoke -- --all   (revokes all from DB)');
    process.exit(0);
  }

  if (!process.env.SAS_ISSUER_KEYPAIR) {
    console.error('SAS_ISSUER_KEYPAIR not set in .env');
    process.exit(1);
  }

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SAS_ISSUER_KEYPAIR));
  const payer = await createKeyPairSignerFromBytes(keypair.secretKey);
  console.log(`Issuer: ${payer.address}\n`);

  let attestationPdas: string[] = [];

  if (args[0] === '--wallet' && args[1]) {
    // Derive PDA from wallet address
    const credPda = process.env.SAS_CREDENTIAL_PDA;
    const schemaPda = process.env.SAS_SCHEMA_PDA;
    if (!credPda || !schemaPda) {
      console.error('SAS_CREDENTIAL_PDA and SAS_SCHEMA_PDA must be set in .env');
      process.exit(1);
    }
    const [attPda] = await deriveAttestationPda({
      credential: address(credPda),
      schema: address(schemaPda),
      nonce: address(args[1]),
    });
    attestationPdas = [String(attPda)];
    console.log(`Derived attestation PDA for wallet ${args[1]}:`);
    console.log(`  ${attPda}\n`);

  } else if (args[0] === '--all') {
    // Load all attestation PDAs from the database
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const credentials = await prisma.credential.findMany({
      where: { attestationPda: { not: null } },
      select: { credentialId: true, attestationPda: true, walletAddress: true },
    });
    await prisma.$disconnect();

    if (credentials.length === 0) {
      console.log('No credentials with attestation PDAs found in database.');
      process.exit(0);
    }

    console.log(`Found ${credentials.length} credential(s) with on-chain attestations:\n`);
    for (const c of credentials) {
      console.log(`  ${c.credentialId} → ${c.attestationPda} (wallet: ${c.walletAddress})`);
      attestationPdas.push(c.attestationPda!);
    }
    console.log('');

  } else {
    // Direct PDA argument
    attestationPdas = [args[0]];
  }

  // Revoke each attestation
  for (const pdaStr of attestationPdas) {
    console.log(`Revoking: ${pdaStr}`);

    // Check if account exists
    const info = await rpc.getAccountInfo(address(pdaStr), { encoding: 'base64' }).send();
    if (!info.value) {
      console.log(`  Already closed/revoked. Skipping.\n`);
      continue;
    }

    try {
      const credAddr = address(process.env.SAS_CREDENTIAL_PDA!);
      const schemaAddr = address(process.env.SAS_SCHEMA_PDA!);

      const ix = getCloseAttestationInstruction({
        payer,
        authority: payer,
        credential: credAddr,
        schema: schemaAddr,
        attestation: address(pdaStr),
      } as any);

      const { value: bh } = await rpc.getLatestBlockhash().send();
      const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(payer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
        (m) => appendTransactionMessageInstruction(ix, m),
      );
      const signed = await signTransactionMessageWithSigners(msg);
      const sig = await sendAndConfirm(signed as any, { commitment: 'confirmed' });
      console.log(`  Revoked. Tx: ${sig}\n`);
    } catch (err: any) {
      console.error(`  Failed: ${err.message}\n`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', (err as Error).message);
  process.exit(1);
});
