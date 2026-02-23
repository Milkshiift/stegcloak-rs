import { StegCloak } from "../pkg/stegcloak_rs.js";
import fs from "node:fs";
import path from 'node:path';

// ── Statistics helpers ───────────────────────────────────────────────────────

function stats(samples) {
  const n = samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);

  return {
    n,
    mean,
    stddev,
    min: sorted[0],
    max: sorted[n - 1],
    median:
        n % 2 === 0
            ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
            : sorted[Math.floor(n / 2)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
    opsPerSec: 1000 / mean,
  };
}

function formatMs(ms) {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)} ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatOps(ops) {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M ops/s`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K ops/s`;
  return `${ops.toFixed(2)} ops/s`;
}

function printStats(label, s) {
  console.log(`  ${label}`);
  console.log(
      `    mean=${formatMs(s.mean)}  median=${formatMs(s.median)}  ` +
      `stddev=${formatMs(s.stddev)}  (${formatOps(s.opsPerSec)})`
  );
  console.log(
      `    min=${formatMs(s.min)}  max=${formatMs(s.max)}  ` +
      `p95=${formatMs(s.p95)}  p99=${formatMs(s.p99)}  n=${s.n}`
  );
}

// ── Bench harness ────────────────────────────────────────────────────────────

async function bench(label, fn, { warmup = 5, iterations = 50 } = {}) {
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }

  const s = stats(samples);
  printStats(label, s);
  return s;
}

// ── Benchmark Suites ─────────────────────────────────────────────────────────

const LOREM_IPSUM = fs.readFileSync(path.join(import.meta.dirname, './loremIpsum.txt'), 'utf8');
function getLoremMessage(length) {
  let result = "";
  while (result.length < length) {
    result += LOREM_IPSUM + " ";
  }
  return result.substring(0, length);
}

async function benchMaxCapacity() {
  console.log("\n🔸 Capacity Analysis: Max message size for 2000 char output");
  console.log("  (Using Lorem Ipsum payload and empty cover)");

  const sc = new StegCloak();
  const password = "capacity-bench-pass";
  const salt = "capacity-bench-salt";
  const cover = "";
  const TARGET_LIMIT = 2000;

  sc.hide("warmup", password, salt, cover);

  // ── Step 1: Find the Upper Bound ───────────────────────────────────────────
  let low = 0;
  let high = 2000;

  try {
    while (true) {
      const msg = getLoremMessage(high);
      const cloaked = sc.hide(msg, password, salt, cover);

      if (cloaked.length > TARGET_LIMIT) {
        break;
      }

      low = high;
      high *= 2;

      if (high > 1_000_000) break;
    }
  } catch (e) {
    console.error("  Error during range expansion:", e.message);
  }

  // ── Step 2: Binary Search for Precision ─────────────────────────────────────
  let bestInputLength = low;
  let bestOutputLength = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid === 0) { low = 1; continue; }

    const message = getLoremMessage(mid);

    try {
      const cloaked = sc.hide(message, password, salt, cover);

      if (cloaked.length <= TARGET_LIMIT) {
        bestInputLength = mid;
        bestOutputLength = cloaked.length;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } catch (e) {
      // If the payload is too large for the wasm buffer or logic, treat as 'too big'
      high = mid - 1;
    }
  }

  // ── Reporting ──────────────────────────────────────────────────────────────
  const overhead = bestOutputLength - bestInputLength;
  const ratio = (bestInputLength / bestOutputLength) * 100;

  console.log(`  Search range found: 0 to ${high + 1}`);
  console.log(`  Target Limit:      ${TARGET_LIMIT} characters`);
  console.log(`  Max Hidden Msg:    ${bestInputLength.toLocaleString()} characters (Lorem Ipsum)`);
  console.log(`  Resulting Length:  ${bestOutputLength.toLocaleString()} characters`);
  console.log(`  Overhead:          ${overhead.toLocaleString()} characters`);
  console.log(`  Efficiency:        ${ratio.toFixed(2)}% payload-to-output ratio`);
}

async function benchKeyDerivation() {
  console.log("\n🔸 Key Derivation (Argon2id)");
  console.log("  Note: first call derives key, subsequent calls hit cache.\n");

  let counter = 0;
  await bench(
      "derive_key (uncached, unique salt each time)",
      async () => {
        const sc = new StegCloak();
        const salt = `unique-salt-bench-${counter++}`;
        const cover = "Test sentence for key derivation benchmark test";
        sc.hide("x", "password-bench", salt, cover);
      },
      { warmup: 2, iterations: 10 }
  );
}

async function benchConcealReveal() {
  console.log("\n🔸 Conceal / Reveal (full pipeline, cached key)");

  const sc = new StegCloak();
  const password = "bench-conceal";
  const salt = "salt-conceal-rv";
  const cover = "Simple cover text with spaces for testing";

  sc.hide("x", password, salt, cover);

  const message = "B".repeat(200);

  let cloaked;
  const hideStats = await bench(
      "hide(200 chars, cached)",
      async () => {
        cloaked = sc.hide(message, password, salt, cover);
      },
      { warmup: 20, iterations: 200 }
  );

  const revealStats = await bench(
      "reveal(200 chars, cached)",
      () => sc.reveal(cloaked, password, salt),
      { warmup: 20, iterations: 200 }
  );

  console.log(
      `\n  Round-trip: ${formatMs(hideStats.mean + revealStats.mean)} mean`
  );
}

async function benchIsCloaked() {
  console.log("\n🔸 isCloaked() detection");

  const cover = "Normal text without any hidden content at all";

  const sc = new StegCloak();
  const cloaked = sc.hide(
      "secret",
      "password-detect",
      "salt-detection-v",
      "Some cover text for benchmark"
  );

  const BATCH = 10_000;

  await bench(
      `isCloaked(clean) × ${BATCH.toLocaleString()}`,
      async () => {
        for (let i = 0; i < BATCH; i++) {
          StegCloak.isCloaked(cover);
        }
      },
      { warmup: 5, iterations: 50 }
  );

  await bench(
      `isCloaked(cloaked) × ${BATCH.toLocaleString()}`,
      async () => {
        for (let i = 0; i < BATCH; i++) {
          StegCloak.isCloaked(cloaked);
        }
      },
      { warmup: 5, iterations: 50 }
  );
}

// ── Runner ───────────────────────────────────────────────────────────────────

export async function runBenchmarks() {
  console.log("⏱️  Running benchmarks...");

  await benchKeyDerivation();
  await benchConcealReveal();
  await benchIsCloaked();
  await benchMaxCapacity();

  console.log("\n⏱️  Benchmarks complete.");
}