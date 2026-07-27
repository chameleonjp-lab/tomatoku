import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODEBERG_PUBLIC_ENTRIES,
  prepareCodebergPages,
  verifyPublicReferences,
} from "./prepare-codeberg-pages.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, `.codeberg-site-test-${process.pid}`);
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

assert.deepEqual(CODEBERG_PUBLIC_ENTRIES, [
  "index.html",
  "src",
  "generated/variable-stage-bank-v2.json",
]);

try {
  const files = prepareCodebergPages({ rootDir: ROOT, outputDir: OUTPUT });
  assert.ok(files.includes("index.html"));
  assert.ok(files.includes("src/main.js"));
  assert.ok(files.includes("src/styles.css"));
  assert.ok(files.includes("src/accessibility.css"));
  assert.ok(files.includes("generated/variable-stage-bank-v2.json"));
  assert.deepEqual(verifyPublicReferences(OUTPUT), []);

  for (const forbiddenPrefix of [
    ".git/",
    ".github/",
    "docs/",
    "review/",
    "scripts/",
    "test/",
  ]) {
    assert.equal(
      files.some((file) => file.startsWith(forbiddenPrefix)),
      false,
      `${forbiddenPrefix} must not be published`
    );
  }
  for (const forbiddenFile of [
    "package.json",
    "package-lock.json",
    "playwright.config.js",
    "SUPABASE_URL.txt",
    "Publishable key.txt",
  ]) {
    assert.equal(files.includes(forbiddenFile), false);
  }

  const practiceBank = JSON.parse(
    fs.readFileSync(
      path.join(OUTPUT, "generated/variable-stage-bank-v2.json"),
      "utf8"
    )
  );
  assert.equal(practiceBank.stageCount, 84);
  assert.equal(practiceBank.runtimeEnabled, true);
  assert.equal(practiceBank.rankingEligible, false);
} finally {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
}

const workflow = read(".github/workflows/deploy-codeberg-pages.yml");
assert.match(workflow, /branches:\s*\n\s+- main/);
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /pull_request:/);
assert.match(workflow, /contents: read/);
assert.match(workflow, /npm run test:codeberg-pages/);
assert.match(workflow, /node scripts\/prepare-codeberg-pages\.js/);
assert.match(workflow, /CODEBERG_USERNAME: \$\{\{ secrets\.CODEBERG_USERNAME \}\}/);
assert.match(workflow, /CODEBERG_TOKEN: \$\{\{ secrets\.CODEBERG_TOKEN \}\}/);
assert.match(workflow, /CODEBERG_REPOSITORY: tomatooku/);
assert.match(workflow, /GIT_ASKPASS/);
assert.match(workflow, /git -C _deploy push origin pages/);
assert.doesNotMatch(workflow, /https:\/\/[^/\s]*:\$\{\{ secrets\.CODEBERG_TOKEN/);
assert.doesNotMatch(workflow, /push origin .*(--force|-f)\b/);

const deployDocument = read("docs/CODEBERG_PAGES_DEPLOY.md");
assert.match(deployDocument, /external prerequisites pending/);
assert.match(deployDocument, /chameleonjp\/tomatooku/);
assert.match(deployDocument, /CODEBERG_USERNAME/);
assert.match(deployDocument, /CODEBERG_TOKEN/);
assert.match(deployDocument, /pages/);
assert.match(deployDocument, /mainへのpush/);
assert.match(deployDocument, /Pull RequestではCodebergへ送信しない/);

console.log("✓ Codeberg Pages公開物・参照・認証・送信条件は安全契約に一致");
