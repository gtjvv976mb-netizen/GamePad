// Compiles Solidity with solc-js (the npm `solc` package, wasm bundled) so builds work fully offline.
// `node scripts/build.mjs` writes out/GamePadStore.json ({ contractName, abi, bytecode, deployedBytecode, compiler }).
// `compile()` is also imported by tests to build test-only fixture contracts.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARTIFACT_PATH = join(ROOT, "out", "GamePadStore.json");

// Shared settings: Base Sepolia and Sepolia both support Cancun; the test EVM is pinned to the same hardfork.
const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
};

// Resolves `@openzeppelin/...` (and any other package) imports from node_modules, relative ones from the project.
function findImports(path) {
  for (const base of [join(ROOT, "node_modules"), ROOT]) {
    const file = join(base, path);
    if (existsSync(file)) return { contents: readFileSync(file, "utf8") };
  }
  return { error: `File not found: ${path}` };
}

/** Compile project-relative .sol files; returns { [contractName]: { abi, bytecode, deployedBytecode } }. */
export function compile(files) {
  const sources = Object.fromEntries(files.map((f) => [f, { content: readFileSync(join(ROOT, f), "utf8") }]));
  const input = { language: "Solidity", sources, settings: SETTINGS };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  for (const w of (output.errors ?? []).filter((e) => e.severity !== "error")) console.warn(w.formattedMessage);
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));

  const contracts = {};
  for (const f of files) {
    for (const [name, c] of Object.entries(output.contracts[f] ?? {})) {
      contracts[name] = {
        abi: c.abi,
        bytecode: `0x${c.evm.bytecode.object}`,
        deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
      };
    }
  }
  return contracts;
}

export function build() {
  const { GamePadStore } = compile(["src/GamePadStore.sol"]);
  const artifact = { contractName: "GamePadStore", compiler: `solc ${solc.version()}`, evmVersion: SETTINGS.evmVersion, ...GamePadStore };
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + "\n");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = build();
  const size = (a.deployedBytecode.length - 2) / 2;
  console.log(`Compiled GamePadStore with ${a.compiler} -> out/GamePadStore.json (runtime ${size} bytes, ${a.abi.length} ABI entries)`);
}
