import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GITHUB_PAGES_PUBLIC_ENTRIES,
  prepareGitHubPages,
  verifyPublicReferences,
} from "./prepare-github-pages.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  ROOT,
  `.github-pages-site-test-${process.pid}`
);
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

assert.deepEqual(GITHUB_PAGES_PUBLIC_ENTRIES, [
  "index.html",
  "src",
  "generated/variable-stage-bank-v2.json",
  "generated/balanced-official-draw-v1.json",
]);

try {
  const files = prepareGitHubPages({ rootDir: ROOT, outputDir: OUTPUT });
  assert.ok(files.includes("index.html"));
  assert.ok(files.includes("src/main.js"));
  assert.ok(files.includes("src/styles.css"));
  assert.ok(files.includes("src/accessibility.css"));
  assert.ok(files.includes("generated/variable-stage-bank-v2.json"));
  assert.ok(files.includes("generated/balanced-official-draw-v1.json"));
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

  const randomBank = JSON.parse(
    fs.readFileSync(
      path.join(OUTPUT, "generated/variable-stage-bank-v2.json"),
      "utf8"
    )
  );
  assert.equal(randomBank.stageCount, 84);
  assert.equal(randomBank.runtimeEnabled, true);
  assert.equal(randomBank.rankingEligible, true);
} finally {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
}

const workflow = read(".github/workflows/deploy-github-pages.yml");
assert.match(workflow, /branches:\s*\n\s+- main/);
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /pull_request:/);
assert.match(workflow, /contents: read/);
assert.match(workflow, /pages: write/);
assert.match(workflow, /id-token: write/);
assert.match(workflow, /npm test/);
assert.match(workflow, /node scripts\/prepare-github-pages\.js/);
assert.match(workflow, /actions\/configure-pages@v5/);
assert.match(workflow, /actions\/upload-pages-artifact@v4/);
assert.match(workflow, /path: _site/);
assert.match(workflow, /environment:\s*\n\s+name: github-pages/);
assert.match(workflow, /actions\/deploy-pages@v4/);
assert.doesNotMatch(workflow, /CODEBERG_/);
assert.doesNotMatch(workflow, /secrets\./);
assert.doesNotMatch(workflow, /\bgit\s+push\b/);

for (const retiredPath of [
  ".github/workflows/deploy-codeberg-pages.yml",
  "docs/CODEBERG_PAGES_DEPLOY.md",
  "scripts/prepare-codeberg-pages.js",
  "scripts/codeberg-pages.test.js",
]) {
  assert.equal(
    fs.existsSync(path.join(ROOT, retiredPath)),
    false,
    `${retiredPath} must be retired`
  );
}

const productionUrl = "https://chameleonjp-lab.github.io/tomatooku/";
const obsoleteUrl = "https://chameleonjp.codeberg.page/tomatooku/";
const currentContractFiles = [
  "README.md",
  "src/main.js",
  "docs/GITHUB_PAGES_DEPLOY.md",
  "docs/IMPLEMENTATION_PLAN_v2.md",
  "docs/RANKING_LAUNCH_v2.md",
  "docs/REQUIREMENTS_v2.md",
  "docs/SPEC_v2.md",
  "docs/SUPABASE_SETUP.md",
  "docs/RELEASE_DEVICE_CHECK_v2.md",
];
for (const relativePath of currentContractFiles) {
  const content = read(relativePath);
  assert.equal(
    content.includes(obsoleteUrl),
    false,
    `${relativePath} must not reference the retired game URL`
  );
}
assert.ok(read("src/main.js").includes(productionUrl));

const deployDocument = read("docs/GITHUB_PAGES_DEPLOY.md");
assert.match(deployDocument, /repository setting pending/);
assert.match(deployDocument, /chameleonjp-lab\.github\.io\/tomatooku/);
assert.match(deployDocument, /Source[\s\S]*GitHub Actions/);
assert.match(deployDocument, /mainへのpush/);
assert.match(deployDocument, /Repository Secretsは不要/);

console.log(
  "✓ GitHub Pages公開物・参照・権限・公開先は安全契約に一致"
);
