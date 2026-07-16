// Shape of the replay packs written by scripts/harvest-replays.mjs.
//
// A pack is the raw TxLINE score feed for one finished fixture, exactly as the
// live stream would have delivered it. Keeping the records raw (PascalCase,
// untouched) matters: the browser feeds them through the same
// normalizeScoreSnapshot path the live SSE stream uses, so a replay exercises
// the real pipeline rather than a parallel one.
//
// Must stay free of server-only imports so the browser can load packs.

export type ReplayPack = {
  // Fields identical on every record (FixtureId, CompetitionId, ...), hoisted
  // out by the harvester and merged back on read.
  meta: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
};

export type ReplayOddsPoint = {
  InRunning: boolean | null;
  // [home, draw, away] win probabilities as percentages, already demarginated
  // by TxLINE.
  Pct: number[];
  Prices: number[] | null;
  Ts: number;
};

export function rehydrateReplayPack(pack: ReplayPack): unknown[] {
  return pack.records.map((record) => ({ ...pack.meta, ...record }));
}

export function replayPackUrl(fixtureId: number): string {
  return `/replays/${fixtureId}.json.gz`;
}

export function replayOddsUrl(fixtureId: number): string {
  return `/replays/${fixtureId}.odds.json.gz`;
}

// Packs ship gzipped (6MB of match data compresses to well under a tenth of
// that) and are served as application/gzip with no Content-Encoding, so the
// browser hands us the compressed bytes and we inflate them ourselves.
async function fetchGzipJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    return null;
  }

  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();

  return JSON.parse(text) as T;
}

export async function loadReplayRecords(fixtureId: number): Promise<unknown[] | null> {
  const pack = await fetchGzipJson<ReplayPack>(replayPackUrl(fixtureId));

  return pack ? rehydrateReplayPack(pack) : null;
}

export async function loadReplayOdds(fixtureId: number): Promise<ReplayOddsPoint[]> {
  return (await fetchGzipJson<ReplayOddsPoint[]>(replayOddsUrl(fixtureId))) ?? [];
}
