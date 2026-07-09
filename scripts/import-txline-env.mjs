import fs from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const defaultResultPath = path.resolve(
  appRoot,
  "../txline-validation/out/txline-devnet-result.json",
);
const resultPath = path.resolve(process.env.TXLINE_RESULT_PATH ?? defaultResultPath);
const envPath = path.join(appRoot, ".env.local");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(resultPath)) {
  fail(`TxLINE result file not found: ${resultPath}`);
}

const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

if (!result.jwt || !result.apiToken || !result.apiOrigin) {
  fail("TxLINE result file is missing jwt, apiToken, or apiOrigin.");
}

const envFile = [
  "TXLINE_NETWORK=devnet",
  `TXLINE_API_ORIGIN=${result.apiOrigin}`,
  `TXLINE_JWT=${result.jwt}`,
  `TXLINE_API_TOKEN=${result.apiToken}`,
  "",
].join("\n");

fs.writeFileSync(envPath, envFile, { mode: 0o600 });

console.log(`Wrote ${envPath}`);
console.log("TxLINE secrets were not printed.");
