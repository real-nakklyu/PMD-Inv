const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const rootDir = path.resolve(__dirname, "../../..");

let nextBin;

try {
  nextBin = require.resolve("next/dist/bin/next", {
    paths: [process.cwd(), __dirname, rootDir]
  });
} catch (error) {
  console.error("Unable to resolve Next.js from the workspace or repo root.");
  console.error(error);
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
