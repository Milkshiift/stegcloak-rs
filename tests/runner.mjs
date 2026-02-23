import { runTests } from "./test.mjs";
import { runBenchmarks } from "./bench.mjs";

const DIVIDER = "═".repeat(70);

async function main() {
  console.log(DIVIDER);
  console.log("  StegCloak WASM — Test & Benchmark Suite");
  console.log(DIVIDER);
  console.log();

  // ── Tests ──────────────────────────────────────────────────────────────
  const testsPassed = await runTests();

  if (!testsPassed) {
    console.error("\n❌ Tests failed. Skipping benchmarks.\n");
    process.exit(1);
  }

  console.log();
  console.log(DIVIDER);
  console.log();

  // ── Benchmarks ─────────────────────────────────────────────────────────
  await runBenchmarks();

  console.log();
  console.log(DIVIDER);
  console.log("  Done.");
  console.log(DIVIDER);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
