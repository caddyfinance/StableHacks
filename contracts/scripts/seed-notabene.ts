import * as anchor from "@coral-xyz/anchor";
import { loadProgram, PROGRAM_IDS, getProvider } from "./helpers";

const VASPS = [
  { vaspId: "VASP-AMINA-CH", name: "AMINA Bank AG", jurisdiction: "CH", lei: "5067007V4BA20IKKZG31" },
  { vaspId: "VASP-AMINA-AE", name: "AMINA Abu Dhabi", jurisdiction: "AE-AZ", lei: "MOCK-LEI-AE-001" },
  { vaspId: "VASP-AMINA-HK", name: "AMINA Hong Kong", jurisdiction: "HK", lei: "MOCK-LEI-HK-001" },
  { vaspId: "VASP-PARTNER-01", name: "ebankit", jurisdiction: "CH", lei: "MOCK-LEI-EB-001" },
  { vaspId: "VASP-PARTNER-02", name: "Metagon", jurisdiction: "CH", lei: "MOCK-LEI-MG-001" },
];

async function main() {
  const program = loadProgram("mock_notabene", PROGRAM_IDS.mockNotabene);
  const provider = getProvider();

  const [configPda] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("notabene_config")],
    program.programId
  );

  console.log("Initializing mock-notabene...");
  try {
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ Notabene initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⓘ Notabene already initialized, skipping");
    } else {
      throw e;
    }
  }

  for (const vasp of VASPS) {
    const [vaspPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vasp"), Buffer.from(vasp.vaspId)],
      program.programId
    );

    try {
      await program.methods
        .registerVasp(vasp.vaspId, vasp.name, vasp.jurisdiction, vasp.lei)
        .accounts({
          vasp: vaspPda,
          config: configPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✓ VASP registered: ${vasp.vaspId} (${vasp.name})`);
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`  ⓘ VASP ${vasp.vaspId} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }
}

main().then(() => console.log("Done")).catch(console.error);
