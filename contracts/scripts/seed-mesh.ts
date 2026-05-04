import * as anchor from "@coral-xyz/anchor";
import { loadProgram, PROGRAM_IDS, getProvider } from "./helpers";

const VENUES = [
  { venueId: "solstice-yield", name: "Solstice eUSX Yield Vault", venueType: { yieldVault: {} }, riskTier: "low", assets: ["USDC", "USDT"] },
  { venueId: "amina-staking", name: "AMINA Staking Service", venueType: { stakingProvider: {} }, riskTier: "low", assets: ["SOL", "ETH"] },
  { venueId: "amina-lending", name: "AMINA Lombard Lending", venueType: { lendingPool: {} }, riskTier: "medium", assets: ["USDC", "BTC"] },
  { venueId: "generic-dex", name: "DEX Aggregator", venueType: { exchange: {} }, riskTier: "medium", assets: ["USDC", "USDT", "SOL"] },
];

async function main() {
  const program = loadProgram("mock_mesh", PROGRAM_IDS.mockMesh);
  const provider = getProvider();

  const [configPda] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("mesh_config")],
    program.programId
  );

  console.log("Initializing mock-mesh...");
  try {
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ Mesh initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⓘ Mesh already initialized, skipping");
    } else {
      throw e;
    }
  }

  for (const venue of VENUES) {
    const [venuePda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("venue"), Buffer.from(venue.venueId)],
      program.programId
    );

    try {
      await program.methods
        .registerVenue(venue.venueId, venue.name, venue.venueType, venue.riskTier, venue.assets)
        .accounts({
          venue: venuePda,
          config: configPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✓ Venue registered: ${venue.venueId} (${venue.name})`);
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`  ⓘ Venue ${venue.venueId} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }
}

main().then(() => console.log("Done")).catch(console.error);
