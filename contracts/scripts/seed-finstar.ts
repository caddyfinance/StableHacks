import { loadProgram, PROGRAM_IDS, getProvider } from "./helpers";

async function main() {
  const program = loadProgram("mock_finstar", PROGRAM_IDS.mockFinstar);
  const provider = getProvider();

  const [configPda] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("finstar_config")],
    program.programId
  );

  console.log("Initializing mock-finstar...");
  console.log("  Config PDA:", configPda.toBase58());

  try {
    await program.methods
      .initialize("AMINA Bank AG", "HBL-ASP-001")
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ Finstar initialized: AMINA Bank AG / HBL-ASP-001");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⓘ Finstar already initialized, skipping");
    } else {
      throw e;
    }
  }
}

import * as anchor from "@coral-xyz/anchor";
main().then(() => console.log("Done")).catch(console.error);
