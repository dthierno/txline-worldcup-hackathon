import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { createClient, fail, readEnv, sweepBuckets } from "./lib/txline-bulk.mjs";

// Adds the odds track to each pack written by harvest-replays.mjs, so a replay
// can show the market moving as the match unfolds.
//
// Only the demargined 1X2 line is kept: it is the market the pages actually
// read (the scoreline model splits lambda by its shares), and a fixture emits
// ~86k odds records across every market, far more than a replay needs.

const appRoot = process.cwd();
const outDir = path.join(appRoot, "public", "replays");
const manifestPath = path.join(outDir, "manifest.json");

const MARKET = "1X2_PARTICIPANT_RESULT";

if (!fs.existsSync(manifestPath)) {
  fail("No public/replays/manifest.json — run `npm run txline:replays` first.");
}

const client = createClient(readEnv(appRoot));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let index = 0;
let withOdds = 0;

for (const entry of manifest) {
  index += 1;

  const label = `[${String(index).padStart(2)}/${manifest.length}] ${entry.homeTeam} v ${entry.awayTeam}`;
  const { failures, records } = await sweepBuckets(client, {
    feed: "odds",
    fixtureId: entry.fixtureId,
    kickoff: entry.kickoff,
  });

  if (failures > 0) {
    console.log(`${label} — SKIPPED, ${failures} buckets unreachable`);
    continue;
  }

  // MarketParameters and MarketPeriod mark the derived sub-lines (per-half,
  // per-handicap); the pages read the plain full-match line only. An empty Pct
  // is a suspended market, not a price.
  const wanted = records.filter(
    (record) =>
      record.SuperOddsType === MARKET &&
      !record.MarketParameters &&
      !record.MarketPeriod &&
      Array.isArray(record.Pct) &&
      record.Pct.length >= 3 &&
      record.Pct.every((value) => Number.isFinite(Number(value))),
  );
  // Odds records carry no Seq — Ts is the only ordering key.
  const byTs = new Map();

  for (const record of wanted) {
    byTs.set(record.Ts, {
      InRunning: record.InRunning ?? null,
      Pct: record.Pct.map(Number),
      Prices: Array.isArray(record.Prices) ? record.Prices.map(Number) : null,
      Ts: record.Ts,
    });
  }

  const odds = [...byTs.values()].sort((left, right) => left.Ts - right.Ts);

  if (odds.length === 0) {
    entry.oddsPoints = 0;
    console.log(`${label} — no odds`);
    continue;
  }

  const body = zlib.gzipSync(JSON.stringify(odds), { level: 9 });

  fs.writeFileSync(path.join(outDir, `${entry.fixtureId}.odds.json.gz`), body);

  const inPlay = odds.filter((point) => point.InRunning);

  entry.oddsPoints = odds.length;
  entry.oddsInPlayPoints = inPlay.length;
  entry.oddsSizeKb = Math.round(body.length / 1024);
  // How far into the match the market kept pricing, in minutes after kickoff.
  entry.oddsCoversToMin = Math.round((odds.at(-1).Ts - entry.kickoff) / 60000);
  withOdds += 1;

  console.log(
    `${label} — ${odds.length} points (${inPlay.length} in-play), ` +
      `${odds[0].Pct.map((value) => value.toFixed(0)).join("/")} → ` +
      `${odds.at(-1).Pct.map((value) => value.toFixed(0)).join("/")}, ` +
      `covers to ${entry.oddsCoversToMin}', ${Math.round(body.length / 1024)}KB`,
  );
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const totalKb = manifest.reduce((sum, entry) => sum + (entry.oddsSizeKb ?? 0), 0);
const covered = manifest.filter((entry) => (entry.oddsCoversToMin ?? 0) >= 90).length;

console.log(`\nOdds tracks: ${withOdds}/${manifest.length}, ${Math.round(totalKb / 1024 * 10) / 10}MB`);
console.log(`Priced past 90': ${covered}/${manifest.length}`);
console.log(
  `Requests: ${client.stats.requests} (${client.stats.retries} retries, ${client.stats.throttled} throttled)`,
);
