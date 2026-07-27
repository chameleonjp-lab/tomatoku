import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const CODEBERG_PUBLIC_ENTRIES = Object.freeze([
  "index.html",
  "src",
  "generated/variable-stage-bank-v2.json",
]);

function assertSafeOutputDirectory(rootDir, outputDir) {
  const relative = path.relative(rootDir, outputDir);
  const basename = path.basename(outputDir);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw new Error("output directory must be a child of the repository root");
  }
  if (basename !== "_site" && !basename.startsWith(".codeberg-site-test-")) {
    throw new Error("output directory must be _site or a dedicated test directory");
  }
}

function copyEntry(sourcePath, destinationPath) {
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`symbolic links are not allowed in the public package: ${sourcePath}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const name of fs.readdirSync(sourcePath).sort()) {
      copyEntry(path.join(sourcePath, name), path.join(destinationPath, name));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`unsupported public package entry: ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

export function listFiles(directory, prefix = "") {
  const files = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const absolutePath = path.join(directory, name);
    const relativePath = path.posix.join(prefix, name);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`symbolic links are not allowed in the public package: ${relativePath}`);
    }
    if (stat.isDirectory()) {
      files.push(...listFiles(absolutePath, relativePath));
    } else if (stat.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function localReferences(content, extension) {
  const references = new Set();
  const patterns = [];

  if (extension === ".html") {
    patterns.push(/\b(?:src|href)=["']([^"'?#]+)["']/g);
  }
  if (extension === ".css") {
    patterns.push(/\burl\(\s*["']?([^"')?#]+)["']?\s*\)/g);
  }
  if (extension === ".js") {
    patterns.push(/\bfrom\s+["']([^"']+)["']/g);
    patterns.push(/\bnew\s+URL\(\s*["']([^"']+)["']/g);
  }

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const reference = match[1];
      if (
        reference.startsWith("./") ||
        reference.startsWith("../")
      ) {
        references.add(reference);
      }
    }
  }
  return [...references];
}

export function verifyPublicReferences(siteDir) {
  const problems = [];
  for (const relativePath of listFiles(siteDir)) {
    const extension = path.extname(relativePath);
    if (![".html", ".css", ".js"].includes(extension)) continue;

    const absolutePath = path.join(siteDir, relativePath);
    const content = fs.readFileSync(absolutePath, "utf8");
    for (const reference of localReferences(content, extension)) {
      const resolved = path.resolve(path.dirname(absolutePath), reference);
      const relativeTarget = path.relative(siteDir, resolved);
      if (
        relativeTarget.startsWith(`..${path.sep}`) ||
        relativeTarget === ".." ||
        path.isAbsolute(relativeTarget)
      ) {
        problems.push(`${relativePath}: public rootの外を参照しています: ${reference}`);
        continue;
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        problems.push(`${relativePath}: 公開物に参照先がありません: ${reference}`);
      }
    }
  }
  return problems;
}

export function prepareCodebergPages({
  rootDir = DEFAULT_ROOT,
  outputDir = path.join(rootDir, "_site"),
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedOutput = path.resolve(outputDir);
  assertSafeOutputDirectory(resolvedRoot, resolvedOutput);

  for (const entry of CODEBERG_PUBLIC_ENTRIES) {
    const sourcePath = path.join(resolvedRoot, entry);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`required public entry is missing: ${entry}`);
    }
  }

  fs.rmSync(resolvedOutput, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutput, { recursive: true });
  for (const entry of CODEBERG_PUBLIC_ENTRIES) {
    copyEntry(path.join(resolvedRoot, entry), path.join(resolvedOutput, entry));
  }

  const referenceProblems = verifyPublicReferences(resolvedOutput);
  if (referenceProblems.length) {
    throw new Error(referenceProblems.join("\n"));
  }

  return listFiles(resolvedOutput);
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  const files = prepareCodebergPages();
  console.log(`Codeberg Pages public package: ${files.length} files`);
  for (const file of files) console.log(file);
}
