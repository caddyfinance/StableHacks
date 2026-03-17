/**
 * SAS Setup Script
 *
 * Run: npm run sas:setup
 *
 * - Reuses existing keypair from .env if set
 * - Skips credential/schema creation if they already exist on-chain
 * - Always prints the correct .env values at the end
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes,
  address, pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, sendAndConfirmTransactionFactory, lamports,
} from '@solana/kit';
import {
  getCreateCredentialInstruction, getCreateSchemaInstruction,
  deriveCredentialPda, deriveSchemaPda,
} from 'sas-lib';
import bs58 from 'bs58';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const RPC_WS_URL = RPC_URL.replace('https', 'wss');
const CREDENTIAL_NAME = 'amina-institutional';
const SCHEMA_NAME = 'amina-cred-v3';
const SCHEMA_VERSION = 1;
const SCHEMA_DESCRIPTION = 'AMINA institutional credential - 5 string fields';
const SCHEMA_FIELD_NAMES = ['credentialId', 'clientReference', 'jurisdiction', 'riskTier', 'productEligibility'];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== SAS Setup for AMINA Institutional Vault ===\n');

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // 1. Keypair
  let keypair: Keypair;
  let secretKeyBase58: string;
  const existingKey = process.env.SAS_ISSUER_KEYPAIR;
  if (existingKey) {
    console.log('1. Loading existing issuer keypair from .env');
    keypair = Keypair.fromSecretKey(bs58.decode(existingKey));
    secretKeyBase58 = existingKey;
  } else {
    console.log('1. Generating new issuer keypair');
    keypair = Keypair.generate();
    secretKeyBase58 = bs58.encode(keypair.secretKey);
  }
  const payer = await createKeyPairSignerFromBytes(keypair.secretKey);
  console.log(`   Address: ${payer.address}`);

  // 2. Balance
  console.log('\n2. Checking balance...');
  const bal = await rpc.getBalance(payer.address).send();
  const solBal = Number(bal.value) / 1e9;
  console.log(`   Balance: ${solBal} SOL`);
  if (solBal < 0.1) {
    console.log('   Low balance. Attempting airdrop...');
    try {
      await rpc.requestAirdrop(payer.address, lamports(2_000_000_000n)).send();
      await sleep(15000);
      const nb = await rpc.getBalance(payer.address).send();
      console.log(`   New balance: ${Number(nb.value) / 1e9} SOL`);
    } catch {
      console.log(`   Airdrop failed. Fund manually: https://faucet.solana.com/`);
      console.log(`   Address: ${payer.address}`);
      printEnv(secretKeyBase58, '', '');
      return;
    }
  }

  // 3. Credential
  console.log('\n3. Credential...');
  const [credPda] = await deriveCredentialPda({ authority: payer.address, name: CREDENTIAL_NAME });
  console.log(`   PDA: ${credPda}`);
  const credInfo = await rpc.getAccountInfo(credPda, { encoding: 'base64' }).send();
  if (credInfo.value) {
    console.log('   Already exists on-chain.');
  } else {
    console.log('   Creating...');
    const ix = getCreateCredentialInstruction({
      payer, credential: credPda, authority: payer,
      name: CREDENTIAL_NAME, signers: [payer.address],
    });
    const { value: bh } = await rpc.getLatestBlockhash().send();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
      (m) => appendTransactionMessageInstruction(ix, m),
    );
    const signed = await signTransactionMessageWithSigners(msg);
    const sig = await sendAndConfirm(signed as any, { commitment: 'confirmed' });
    console.log(`   Created. Tx: ${sig}`);
  }

  // 4. Schema
  console.log('\n4. Schema...');
  const [schemaPda] = await deriveSchemaPda({ credential: credPda, name: SCHEMA_NAME, version: SCHEMA_VERSION });
  console.log(`   PDA: ${schemaPda}`);
  const schemaInfo = await rpc.getAccountInfo(schemaPda, { encoding: 'base64' }).send();
  if (schemaInfo.value) {
    console.log('   Already exists on-chain.');
  } else {
    console.log('   Creating with layout: 5x String (byte 12)...');
    const layout = new Uint8Array(SCHEMA_FIELD_NAMES.length);
    layout.fill(12); // 12 = String in SAS compact layout

    const ix = getCreateSchemaInstruction({
      payer, authority: payer, credential: credPda, schema: schemaPda,
      name: SCHEMA_NAME, description: SCHEMA_DESCRIPTION,
      layout, fieldNames: SCHEMA_FIELD_NAMES,
    });
    const { value: bh } = await rpc.getLatestBlockhash().send();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
      (m) => appendTransactionMessageInstruction(ix, m),
    );
    const signed = await signTransactionMessageWithSigners(msg);
    try {
      const sig = await sendAndConfirm(signed as any, { commitment: 'confirmed' });
      console.log(`   Created. Tx: ${sig}`);
    } catch (err: any) {
      console.error('   FAILED:', err.message);
      if (err.cause?.context) {
        console.error('   Program error code:', err.cause.context.code);
      }
      printEnv(secretKeyBase58, String(credPda), '');
      throw err;
    }
  }

  printEnv(secretKeyBase58, String(credPda), String(schemaPda));
}

function printEnv(key: string, cred: string, schema: string) {
  console.log('\n========================================');
  console.log('  .env values');
  console.log('========================================\n');
  console.log(`SAS_ISSUER_KEYPAIR=${key}`);
  console.log(`SAS_CREDENTIAL_PDA=${cred}`);
  console.log(`SAS_SCHEMA_PDA=${schema}`);
  console.log('\n========================================\n');
}

main().catch((err) => {
  console.error('\nSetup error:', (err as Error).message);
  process.exit(1);
});
