import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  extractLineups,
  type NormalizedLineupPlayer,
  type NormalizedLineupTeam,
} from "./txline-normalize";

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

type PackTeamMatch = {
  players: NormalizedLineupPlayer[];
  redCardedIds: Set<number>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

// One recorded match from this team's side: its lineup, plus every player id
// that finished the match sent off (red-card actions that were not discarded,
// and the game_finalised player record - the latter also catches second
// yellows).
function packTeamMatch(
  records: unknown[],
  teamName: string,
): PackTeamMatch | null {
  const team = extractLineups(records)?.teams.find(
    (candidate) => candidate.teamName === teamName,
  );

  if (!team) {
    return null;
  }

  const discarded = new Set(
    records
      .map(asRecord)
      .filter((record) => record?.Action === "action_discarded")
      .map((record) => record?.Id),
  );
  const redCardedIds = new Set<number>();

  for (const raw of records) {
    const record = asRecord(raw);

    if (!record) {
      continue;
    }

    if (record.Action === "red_card" && !discarded.has(record.Id)) {
      const playerId = asRecord(record.Data)?.PlayerId;

      if (typeof playerId === "number") {
        redCardedIds.add(playerId);
      }
    }

    if (record.Action === "game_finalised") {
      const stats = asRecord(record.PlayerStats);

      for (const side of ["Participant1", "Participant2"]) {
        for (const [playerId, line] of Object.entries(
          asRecord(stats?.[side]) ?? {},
        )) {
          const reds = asRecord(line)?.redCards;

          if (typeof reds === "number" && reds > 0) {
            redCardedIds.add(Number(playerId));
          }
        }
      }
    }
  }

  return { players: team.players, redCardedIds };
}

// Projects a team's next XI from its recorded history: whoever starts most
// across the last `span` matches, with anyone sent off in the latest one
// excluded outright - a red card is the one selection fact we can know in
// advance. (FIFA wipes yellow accumulation after the quarter-finals, so reds
// are also the only suspension source that matters by this stage.)
export function readProjectedTeamLineup(
  teamName: string,
  span = 3,
): NormalizedLineupTeam | null {
  const rows = readManifest()
    .filter((row) => row.homeTeam === teamName || row.awayTeam === teamName)
    .sort((left, right) => right.kickoff - left.kickoff);
  const matches: PackTeamMatch[] = [];

  for (const row of rows) {
    if (matches.length >= span) {
      break;
    }

    const records = readReplayRecords(row.fixtureId);
    const match = records ? packTeamMatch(records, teamName) : null;

    if (match) {
      matches.push(match);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Latest appearance wins the metadata; starts accumulate across matches,
  // with the most recent XI worth an extra half so it breaks every tie.
  const meta = new Map<number, NormalizedLineupPlayer>();
  const starts = new Map<number, number>();

  for (const [index, match] of matches.entries()) {
    for (const player of match.players) {
      if (typeof player.playerId !== "number") {
        continue;
      }

      if (!meta.has(player.playerId)) {
        meta.set(player.playerId, player);
      }

      if (player.starter) {
        starts.set(
          player.playerId,
          (starts.get(player.playerId) ?? 0) + 1 + (index === 0 ? 0.5 : 0),
        );
      }
    }
  }

  const suspended = matches[0].redCardedIds;
  const available = [...meta.keys()].filter((id) => !suspended.has(id));
  const startScore = (id: number) => starts.get(id) ?? 0;
  const keepers = available
    .filter((id) => meta.get(id)?.position === "GK")
    .sort((left, right) => startScore(right) - startScore(left));
  const outfielders = available
    .filter((id) => meta.get(id)?.position !== "GK")
    .sort((left, right) => startScore(right) - startScore(left));
  const eleven = new Set<number>([
    ...keepers.slice(0, 1),
    ...outfielders.slice(0, keepers.length > 0 ? 10 : 11),
  ]);

  return {
    isHome: false,
    players: available.map((id) => ({
      ...(meta.get(id) as NormalizedLineupPlayer),
      starter: eleven.has(id),
    })),
    teamName,
  };
}
