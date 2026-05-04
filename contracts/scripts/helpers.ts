import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

export function getProvider(): anchor.AnchorProvider {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
  const walletPath = process.env.WALLET_PATH || "/tmp/amina-deployer.json";
  const raw = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

export function loadIDL(programName: string): any {
  const idlPath = path.join(__dirname, "..", "target", "idl", `${programName}.json`);
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

export function loadProgram(programName: string, programId: PublicKey): anchor.Program {
  const provider = getProvider();
  anchor.setProvider(provider);
  const idl = loadIDL(programName);
  return new anchor.Program(idl, programId, provider);
}

export const PROGRAM_IDS = {
  aminaVault: new PublicKey("5uPg5pi46gXErKcYWyqEAn2uSU68VZSUgvGTPZuVGwyA"),
  mockFinstar: new PublicKey("7jH9Lhe9Ny3a8LxUsS3BCSHoDKmQZz5Vpu1py4pemisF"),
  mockNotabene: new PublicKey("FZ5EaUHqohNGBdsvjr4LYnK181xoBWNhZiUg1iTaf9f7"),
  mockMesh: new PublicKey("3ptgmaf1dWrn8WsmRsat641srbbY1vfBvhMwVwczpoU2"),
  mockJurisdictionEngine: new PublicKey("HhPHx1RgzA99brCGprSg5VwJ8ZRgeXkLADbDRUox3Cq6"),
  mockTranslationLayer: new PublicKey("EokhQnmdSswBvj8VfnV5TBKVantJNqGHWv243L8e6sDv"),
};
