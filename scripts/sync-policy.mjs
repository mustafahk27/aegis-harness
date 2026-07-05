import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = join(scriptDir, "..");
const sourcePath = join(repoDir, "extension/lib/policy.ts");
const outputPath = join(repoDir, "extension/lib/policy.js");

const source = readFileSync(sourcePath, "utf8");
const emitted = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  fileName: sourcePath,
});

writeFileSync(outputPath, emitted.outputText);
