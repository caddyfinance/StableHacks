import * as anchor from "@coral-xyz/anchor";
import { loadProgram, PROGRAM_IDS, getProvider } from "./helpers";

const JURISDICTIONS = [
  { code: "CH", regulatorName: "FINMA", licenseName: "Banking License", travelRuleThreshold: 1_000_000_000, consentAbove: 50_000_000_000, reportingCurrency: "CHF", leverageAllowed: false, amlRequired: true },
  { code: "AE-AZ", regulatorName: "FSRA (ADGM)", licenseName: "FSP License", travelRuleThreshold: 3_500_000_000, consentAbove: 100_000_000_000, reportingCurrency: "AED", leverageAllowed: true, amlRequired: true },
  { code: "HK", regulatorName: "SFC", licenseName: "VATP License", travelRuleThreshold: 8_000_000_000, consentAbove: 80_000_000_000, reportingCurrency: "HKD", leverageAllowed: false, amlRequired: true },
  { code: "SG", regulatorName: "MAS", licenseName: "CMS License", travelRuleThreshold: 1_500_000_000, consentAbove: 60_000_000_000, reportingCurrency: "SGD", leverageAllowed: false, amlRequired: true },
  { code: "AE-DU", regulatorName: "DFSA (DIFC)", licenseName: "DFSA License", travelRuleThreshold: 3_500_000_000, consentAbove: 100_000_000_000, reportingCurrency: "AED", leverageAllowed: true, amlRequired: true },
];

async function main() {
  const program = loadProgram("mock_jurisdiction_engine", PROGRAM_IDS.mockJurisdictionEngine);
  const provider = getProvider();

  const [configPda] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("jurisdiction_config")],
    program.programId
  );

  console.log("Initializing mock-jurisdiction-engine...");
  try {
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("  ✓ Jurisdiction engine initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⓘ Jurisdiction engine already initialized, skipping");
    } else {
      throw e;
    }
  }

  for (const j of JURISDICTIONS) {
    const [rulesPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("jurisdiction"), Buffer.from(j.code)],
      program.programId
    );

    try {
      await program.methods
        .registerJurisdiction(
          j.code,
          j.regulatorName,
          j.licenseName,
          new anchor.BN(j.travelRuleThreshold),
          new anchor.BN(j.consentAbove),
          j.reportingCurrency,
          j.leverageAllowed,
          j.amlRequired
        )
        .accounts({
          rules: rulesPda,
          config: configPda,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`  ✓ Jurisdiction registered: ${j.code} (${j.regulatorName})`);
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`  ⓘ Jurisdiction ${j.code} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }
}

main().then(() => console.log("Done")).catch(console.error);
