import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const baselinePath = path.resolve("scripts/typecheck-debt-baseline.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const tscPath = path.resolve("node_modules/typescript/bin/tsc");
const result = spawnSync(process.execPath, [tscPath, "--noEmit", "--pretty", "false"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error) throw result.error;

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const errorLines = output
  .split(/\r?\n/)
  .filter((line) => /error TS\d+:/.test(line));
const codeCounts = new Map();
const missingModules = new Set();

for (const line of errorLines) {
  const code = line.match(/error (TS\d+):/)?.[1];
  if (code) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  const missingModule = line.match(/Cannot find module '([^']+)'/)?.[1];
  if (missingModule) missingModules.add(missingModule);
}

if (result.status !== 0 && errorLines.length === 0) {
  throw new Error(`TypeScript audit failed without parseable diagnostics: ${output.trim()}`);
}

const current = {
  totalErrors: errorLines.length,
  missingModuleErrors: codeCounts.get("TS2307") ?? 0,
  uniqueMissingModules: missingModules.size,
};
const maximum = baseline.maximumByPlatform?.[process.platform];
if (!maximum) {
  throw new Error(`No inherited typecheck baseline is defined for ${process.platform}.`);
}
const regressions = Object.entries(maximum).filter(
  ([key, ceiling]) => current[key] > ceiling,
);

if (regressions.length > 0) {
  throw new Error(
    `Inherited typecheck debt regressed: ${regressions
      .map(([key, ceiling]) => `${key}=${current[key]} (max ${ceiling})`)
      .join(", ")}`,
  );
}

if (result.status === 0 && current.totalErrors === 0) {
  console.log("Full TypeScript typecheck is green; remove the inherited debt baseline.");
  process.exit(0);
}

console.log(
  `Inherited TypeScript debt is contained on ${process.platform}: ${current.totalErrors} errors, ` +
    `${current.missingModuleErrors} TS2307 errors across ${current.uniqueMissingModules} unique module specifiers. ` +
    "Supported Eclipse contracts are checked separately by typecheck:supported.",
);
