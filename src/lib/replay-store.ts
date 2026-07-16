import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { extractLineups, type NormalizedLineupTeam } from "./txline-normalize";

// Server-side access to the recorded match packs in public/replays, written by
// scripts/harvest-replays.mjs. The packs hold each fixture's raw TxLINE score
// feed - the only copy of it once TxLINE ages the fixture out of its windowed
// endpoints two weeks after kickoff, and the hackathon data window closes.
//
// Server-only: importing this from a client component pulls in node:fs.

type ReplayPack = {
  // Fields identical on every record, hoisted out by the harvester.
  meta: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
};

type ReplayManifestRow = {
  awayTeam: string;
  fixtureId: number;
  homeTeam: string;
  kickoff: number;
};

const packDir = path.join(process.cwd(), "public", "replays");
// Packs are immutable build artifacts; the only invalidation is a redeploy.
const recordsCache = new Map<number, unknown[] | null>();
let manifestCache: ReplayManifestRow[] | null = null;

export function readReplayRecords(fixtureId: number): unknown[] | null {
  const cached = recordsCache.get(fixtureId);

  if (cached !== undefined) {
    return cached;
  }

  const file = path.join(packDir, `${fixtureId}.json.gz`);
  let records: unknown[] | null = null;

  try {
    if (fs.existsSync(file)) {
      const pack = JSON.parse(
        zlib.gunzipSync(fs.readFileSync(file)).toString(),
      ) as ReplayPack;

      records = pack.records.map((record) => ({ ...pack.meta, ...record }));
    }
  } catch {
    records = null;
  }

  recordsCache.set(fixtureId, records);

  return records;
}

function readManifest(): ReplayManifestRow[] {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    manifestCache = JSON.parse(
      fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"),
    ) as ReplayManifestRow[];
  } catch {
    manifestCache = [];
  }

  return manifestCache;
}

// A team's most recent recorded lineup. The scorer pool falls back to this
// when TxLINE has no XI yet and the squad provider is out of quota: it is a
// previous match's squad, but the player ids are TxLINE's own, so picks made
// from it settle without any reconciliation.
export function readLatestPackLineupTeam(
  teamName: string,
): NormalizedLineupTeam | null {
  const rows = readManifest()
    .filter((row) => row.homeTeam === teamName || row.awayTeam === teamName)
    .sort((left, right) => right.kickoff - left.kickoff);

  for (const row of rows) {
    const records = readReplayRecords(row.fixtureId);
    const team = records
      ? extractLineups(records)?.teams.find(
          (candidate) => candidate.teamName === teamName,
        )
      : undefined;

    if (team) {
      return team;
    }
  }

  return null;
}
