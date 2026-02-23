import { StegCloak } from "../pkg/stegcloak_rs.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function assertRejects(asyncFn, nameOrMsg, label) {
  try {
    await asyncFn();
    console.error(`  ❌ ${label} — did not throw`);
    failed++;
  } catch (err) {
    const matches =
        (nameOrMsg && err.name === nameOrMsg) ||
        (nameOrMsg && err.message?.includes(nameOrMsg));
    if (matches) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.error(`  ❌ ${label} — wrong error: [${err.name}] ${err.message}`);
      failed++;
    }
  }
}

// ── Test Suites ──────────────────────────────────────────────────────────────

async function testBasicRoundTrip() {
  console.log("\n🔹 Basic round-trip");

  const sc = new StegCloak();
  const message = "Hello, secret world!";
  const password = "s3cure-p@ss";
  const salt = "chatroom-42";
  const cover = "The quick brown fox jumps over the lazy dog";

  const cloaked = sc.hide(message, password, salt, cover);

  assert(typeof cloaked === "string", "hide() returns a string");
  assert(cloaked.length > cover.length, "cloaked text is longer than cover");
  assert(StegCloak.isCloaked(cloaked), "isCloaked() detects payload");
  assert(!StegCloak.isCloaked(cover), "isCloaked() negative on clean text");

  const revealed = sc.reveal(cloaked, password, salt);
  assertEqual(revealed, message, "reveal() recovers original message");
}

async function testUnicodeMessages() {
  console.log("\n🔹 Unicode messages");

  const sc = new StegCloak();
  const password = "unicode-test";
  const salt = "salt-unicode-room";
  const cover = "Nothing to see here, move along please";

  const messages = [
    "Héllo wörld! Ñoño 日本語 中文 한국어",
    "🔐🎉🚀💻🌍",
    "Ελληνικά Кириллица العربية",
    "𝕳𝖊𝖑𝖑𝖔 𝕱𝖗𝖆𝖐𝖙𝖚𝖗",
    "Tab\there\nnewline",
  ];

  for (const msg of messages) {
    const short = msg.length > 30 ? msg.slice(0, 27) + "..." : msg;
    const cloaked = sc.hide(msg, password, salt, cover);
    const revealed = sc.reveal(cloaked, password, salt);
    assertEqual(revealed, msg, `round-trip: "${short}"`);
  }
}

async function testLongMessage() {
  console.log("\n🔹 Long message");

  const sc = new StegCloak();
  const password = "long-test-password";
  const salt = "salt-long-test-value";
  const cover =
      "This is a perfectly normal sentence that nobody would ever suspect " +
      "of containing hidden information whatsoever in any way shape or form";

  const longMsg = "A".repeat(5000);
  const cloaked = sc.hide(longMsg, password, salt, cover);
  const revealed = sc.reveal(cloaked, password, salt);
  assertEqual(revealed, longMsg, "5 000-char message round-trips");
}

async function testSingleWordCover() {
  console.log("\n🔹 Single-word cover (no spaces)");

  const sc = new StegCloak();
  const password = "password-single";
  const salt = "salt-single-word";
  const cover = "Hello";

  const cloaked = sc.hide("secret", password, salt, cover);
  assert(cloaked.startsWith("Hello"), "cover text preserved at start");
  const revealed = sc.reveal(cloaked, password, salt);
  assertEqual(revealed, "secret", "round-trip with single-word cover");
}

async function testEmptyCover() {
  console.log("\n🔹 Empty cover text");

  const sc = new StegCloak();
  const password = "password-empty";
  const salt = "salt-empty-cover";

  const cloaked = sc.hide("secret", password, salt, "");
  assert(StegCloak.isCloaked(cloaked), "payload present even with empty cover");
  const revealed = sc.reveal(cloaked, password, salt);
  assertEqual(revealed, "secret", "round-trip with empty cover");
}

async function testDifferentPasswords() {
  console.log("\n🔹 Wrong password / salt");

  const sc = new StegCloak();
  const salt = "room-1-chatroom";
  const cover = "Just a normal sentence here today";

  const cloaked = sc.hide("top secret", "correctPassword", salt, cover);

  await assertRejects(
      () => sc.reveal(cloaked, "wrongPassword", salt),
      "DecryptionError",
      "wrong password throws DecryptionError"
  );

  await assertRejects(
      () => sc.reveal(cloaked, "correctPassword", "wrong-salt-value"),
      "DecryptionError",
      "wrong salt throws DecryptionError"
  );
}

async function testValidationErrors() {
  console.log("\n🔹 Validation errors");

  const sc = new StegCloak();

  await assertRejects(
      () => sc.hide("msg", "", "salt-valid-len", "cover"),
      "Password is required",
      "hide() — empty password"
  );

  await assertRejects(
      () => sc.hide("", "password", "salt-valid-len", "cover"),
      "Message cannot be empty",
      "hide() — empty message"
  );

  await assertRejects(
      () => sc.hide("msg", "password", "", "cover"),
      "Salt is required",
      "hide() — empty salt"
  );

  await assertRejects(
      () => sc.reveal("text", "", "salt-valid-len"),
      "Password is required",
      "reveal() — empty password"
  );

  await assertRejects(
      () => sc.reveal("", "password", "salt-valid-len"),
      "Input cannot be empty",
      "reveal() — empty input"
  );

  await assertRejects(
      () => sc.reveal("text", "password", ""),
      "Salt is required",
      "reveal() — empty salt"
  );
}

async function testShortSaltError() {
  console.log("\n🔹 Short salt rejection");

  const sc = new StegCloak();

  await assertRejects(
      () => sc.hide("msg", "password", "ab", "cover text here"),
      "KeyDerivationError",
      "hide() — salt too short (2 bytes) throws KeyDerivationError"
  );

  await assertRejects(
      () => sc.hide("msg", "password", "1234567", "cover text here"),
      "KeyDerivationError",
      "hide() — salt too short (7 bytes) throws KeyDerivationError"
  );

  const cloaked = sc.hide("msg", "password", "12345678", "cover text here");
  const revealed = sc.reveal(cloaked, "password", "12345678");
  assertEqual(revealed, "msg", "salt of exactly 8 bytes works");
}

async function testPayloadNotFound() {
  console.log("\n🔹 No payload in clean text");

  const sc = new StegCloak();

  await assertRejects(
      () => sc.reveal("Just normal text", "password-test", "salt-test-val"),
      "PayloadNotFoundError",
      "reveal() on clean text throws PayloadNotFoundError"
  );
}

async function testZwcCharacters() {
  console.log("\n🔹 ZWC character list");

  const zwc = StegCloak.zwc();

  assertEqual(zwc.length, 8, "zwc() returns 8 characters");
  assert(zwc.every((c) => typeof c === "string"), "all ZWC entries are strings");
  assert(
      zwc.every((c) => c.length === 1 || c.length === 2), // some ZWCs are 2 UTF-16 code units
      "all ZWC entries are single characters"
  );

  const unique = new Set(zwc);
  assertEqual(unique.size, 8, "all 8 ZWC characters are unique");
}

async function testKeyCaching() {
  console.log("\n🔹 Key caching (same instance reuses keys)");

  const sc = new StegCloak();
  const password = "cache-test-pw";
  const salt = "cache-salt-value";
  const cover = "Sentence with spaces for embedding content here";

  // First call derives the key; second call should use cache.
  const c1 = sc.hide("msg1", password, salt, cover);
  const c2 = sc.hide("msg2", password, salt, cover);

  const r1 = sc.reveal(c1, password, salt);
  const r2 = sc.reveal(c2, password, salt);

  assertEqual(r1, "msg1", "first cached round-trip");
  assertEqual(r2, "msg2", "second cached round-trip");
}

async function testMultipleInstances() {
  console.log("\n🔹 Cross-instance compatibility");

  const sc1 = new StegCloak();
  const sc2 = new StegCloak();
  const password = "cross-instance";
  const salt = "instance-salt-v";
  const cover = "Another perfectly normal sentence for testing purposes";

  const cloaked = sc1.hide("shared secret", password, salt, cover);
  const revealed = sc2.reveal(cloaked, password, salt);
  assertEqual(revealed, "shared secret", "instance A hides, instance B reveals");
}

async function testBinaryLikeContent() {
  console.log("\n🔹 Messages with special characters");

  const sc = new StegCloak();
  const password = "binary-test-pw";
  const salt = "test-salt-binary";
  const cover = "Cover text with multiple spaces for payload distribution";

  const messages = [
    '{"key":"value","num":42}',
    "<script>alert('xss')</script>",
    "line1\r\nline2\r\nline3",
    "spaces   and\ttabs\there",
    "emoji 🎉 in 🌍 middle",
  ];

  for (const msg of messages) {
    const short = JSON.stringify(msg).slice(0, 30);
    try {
      const cloaked = sc.hide(msg, password, salt, cover);
      const revealed = sc.reveal(cloaked, password, salt);
      assertEqual(revealed, msg, `special: ${short}`);
    } catch (err) {
      console.error(`  ❌ special: ${short} — ${err.message}`);
      failed++;
    }
  }
}

async function testRepeatedHideProducesDifferentCiphertext() {
  console.log("\n🔹 Nonce uniqueness (same input → different ciphertext)");

  const sc = new StegCloak();
  const password = "nonce-test-pass";
  const salt = "nonce-test-salt";
  const cover = "A simple cover sentence with words";
  const message = "same message every time";

  const results = new Set();
  for (let i = 0; i < 5; i++) {
    const cloaked = sc.hide(message, password, salt, cover);
    results.add(cloaked);

    // Each should still decrypt correctly
    const revealed = sc.reveal(cloaked, password, salt);
    assertEqual(revealed, message, `nonce round-trip #${i + 1}`);
  }

  assert(results.size === 5, "5 encryptions produce 5 unique ciphertexts (unique nonces)");
}

async function testCompressionSideChannel() {
  console.log("\n🔹 Advanced Boundary-Alignment Side-Channel Attack");

  const sc = new StegCloak();
  const password = "oracle-password";
  const salt = "oracle-salt";
  const cover = "Cover text";
  const secret = "SECRET"; // The target

  // The attacker controls 'prefix'.
  // We want to verify if 'S' (correct) compresses better than 'X' (wrong).

  let detected = false;

  // We iterate through padding lengths to find the "Cliff"
  // The attacker adds 'junk' to align the compression to the block boundary.
  for (let pad = 0; pad < 64; pad++) {
    const junk = ".".repeat(pad);

    // Guess 'X' (Wrong)
    const payloadWrong = `Token:X${junk}; Actual:${secret}`;
    const lenWrong = sc.hide(payloadWrong, password, salt, cover).length;

    // Guess 'S' (Correct)
    const payloadRight = `Token:S${junk}; Actual:${secret}`;
    const lenRight = sc.hide(payloadRight, password, salt, cover).length;

    if (lenRight < lenWrong) {
      console.error(`  ❌ LEAK FOUND at padding ${pad}:`);
      console.error(`     Wrong Guess Len: ${lenWrong}`);
      console.error(`     Right Guess Len: ${lenRight} (Smaller!)`);
      detected = true;
      break;
    }
  }

  if (detected) {
    console.error("  ❌ Your padding was defeated by boundary alignment.");
    failed++;
  } else {
    console.log("  ✅ Withstood boundary alignment.");
    passed++;
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────

export async function runTests() {
  console.log("📋 Running tests...\n");

  passed = 0;
  failed = 0;

  await testBasicRoundTrip();
  await testUnicodeMessages();
  await testLongMessage();
  await testSingleWordCover();
  await testEmptyCover();
  await testDifferentPasswords();
  await testValidationErrors();
  await testShortSaltError();
  await testPayloadNotFound();
  await testZwcCharacters();
  await testKeyCaching();
  await testMultipleInstances();
  await testBinaryLikeContent();
  await testRepeatedHideProducesDifferentCiphertext();
  await testCompressionSideChannel();

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  return failed === 0;
}