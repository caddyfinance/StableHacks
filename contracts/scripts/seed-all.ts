import { execSync } from "child_process";
import path from "path";

const scripts = [
  "seed-finstar.ts",
  "seed-notabene.ts",
  "seed-mesh.ts",
  "seed-jurisdictions.ts",
  "seed-translation-layer.ts",
];

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  AMINA Three-Layer Architecture — Seed All");
  console.log("═══════════════════════════════════════════════\n");

  for (const script of scripts) {
    console.log(`\n─── Running ${script} ───\n`);
    try {
      execSync(`npx ts-node ${path.join(__dirname, script)}`, {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
      });
    } catch (e) {
      console.error(`✗ Failed: ${script}`);
      process.exit(1);
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  All seeds completed successfully");
  console.log("═══════════════════════════════════════════════");
}

main();
