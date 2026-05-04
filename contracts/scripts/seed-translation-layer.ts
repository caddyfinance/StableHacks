import * as anchor from "@coral-xyz/anchor";
import { loadProgram, PROGRAM_IDS, getProvider } from "./helpers";

async function main() {
  const program = loadProgram("mock_translation_layer", PROGRAM_IDS.mockTranslationLayer);
  const provider = getProvider();

  const [configPda] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("tl_config")],
    program.programId
  );

  console.log("Initializing mock-translation-layer...");
  console.log("  Config PDA:", configPda.toBase58());
  console.log("  Finstar program:", PROGRAM_IDS.mockFinstar.toBase58());
  console.log("  Notabene program:", PROGRAM_IDS.mockNotabene.toBase58());
  console.log("  Mesh program:", PROGRAM_IDS.mockMesh.toBase58());
  console.log("  Jurisdiction program:", PROGRAM_IDS.mockJurisdictionEngine.toBase58());

  try {
    await program.methods
      .initialize(
        PROGRAM_IDS.mockFinstar,
        PROGRAM_IDS.mockNotabene,
        PROGRAM_IDS.mockMesh,
        PROGRAM_IDS.mockJurisdictionEngine
      )
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ Translation layer initialized with all program references");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⓘ Translation layer already initialized, skipping");
    } else {
      throw e;
    }
  }
}

main().then(() => console.log("Done")).catch(console.error);
