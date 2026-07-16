import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { rehydrateReplayPack, type ReplayPack } from "./replay-pack";

// Server-side access to the replay packs in public/replays.
//
// The routes need these because TxLINE drops a fixture's score feed from
// /scores/updates and /scores/historical within two weeks of kickoff, taking
// the lineups records with it. Without a pack fallback the lineups (and so the
// verified scorer pool, which is keyed by TxLINE's own player ids) go missing
// for every finished match, and the pages fall back to provisional squad data.
//
// Server-only: importing this from a client component pulls in node:fs.

const packDir = path.join(process.cwd(), "public", "replays");
// Packs are immutable build artifacts, so the only invalidation needed is a
// redeploy. Inflating one costs ~10ms and a route may be hit repeatedly.
const cache = new Map<number, unknown[] | null>();

export function readReplayRecords(fixtureId: number): unknown[] | null {
  const cached = cache.get(fixtureId);

  if (cached !== undefined) {
    return cached;
  }

  const file = path.join(packDir, `${fixtureId}.json.gz`);
  let records: unknown[] | null = null;

  try {
    if (fs.existsSync(file)) {
      const pack = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString()) as ReplayPack;

      records = rehydrateReplayPack(pack);
    }
  } catch {
    records = null;
  }

  cache.set(fixtureId, records);

  return records;
}

export function hasReplayPack(fixtureId: number): boolean {
  return readReplayRecords(fixtureId) !== null;
}
