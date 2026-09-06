import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);
const authoredExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const violations = [];

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(entryPath);
      continue;
    }

    if (!authoredExtensions.has(path.extname(entry.name))) continue;

    const lineCount = (await readFile(entryPath, "utf8")).split(
      /\r?\n/u,
    ).length;
    if (lineCount > 400) {
      violations.push(`${path.relative(root, entryPath)}: ${lineCount} lines`);
    }
  }
}

await visit(root);

if (violations.length > 0) {
  console.error(["Authored files over 400 lines:", ...violations].join("\n"));
  process.exitCode = 1;
} else {
  console.log("Source line-count check passed.");
}
