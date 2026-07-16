import fs from "node:fs";
import path from "node:path";

// Shared plumbing for the replay harvest scripts.
//
// The bulk endpoints are the only way to reach fixtures older than the two-week
// /scores/historical window, but they cost ~84 requests per fixture. Firing
// those in parallel gets the burst throttled: the gateway answers 403 with an
// HTML body rather than a JSON error, so a naive `.catch(() => [])` records it
// as "this bucket was empty" and silently drops real match data. Everything
// here exists to make that failure loud and recoverable.

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const INTERVALS_PER_HOUR = 12;
// A match plus warmup and finalisation comfortably fits kickoff -3h..+3h.
export const SWEEP_HOURS = [-3, -2, -1, 0, 1, 2, 3];

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 300;
// Kept low deliberately: 84-wide bursts are what triggers the throttle.
const CONCURRENCY = 6;

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function readEnv(appRoot) {
  const envPath = path.join(appRoot, ".env.local");

  if (!fs.existsSync(envPath)) {
    fail("No .env.local found. Run `npm run txline:env` first.");
  }

  const env = {};

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  if (!env.TXLINE_JWT || !env.TXLINE_API_TOKEN) {
    fail(".env.local is missing TXLINE_JWT or TXLINE_API_TOKEN.");
  }

  return env;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The feed answers in SSE frames; a bucket with no traffic answers empty.
export function parsePayloads(text) {
  return text.split("\n").flatMap((line) => {
    const trimmed = line.startsWith("data:") ? line.slice(5).trim() : line.trim();

    if (!trimmed || trimmed.startsWith(":")) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

export function createClient(env) {
  const origin = env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
  const headers = {
    accept: "text/event-stream",
    Authorization: `Bearer ${env.TXLINE_JWT}`,
    "X-Api-Token": env.TXLINE_API_TOKEN,
  };
  const stats = { requests: 0, retries: 0, throttled: 0 };
  let active = 0;
  const queue = [];

  function pump() {
    while (active < CONCURRENCY && queue.length > 0) {
      const job = queue.shift();

      active += 1;
      job()
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function schedule(task) {
    return new Promise((resolve, reject) => {
      queue.push(() => task().then(resolve, reject));
      pump();
    });
  }

  // Resolves to the parsed payloads, or throws once retries are exhausted so
  // the caller can decide between skipping and aborting. Never conflates a
  // throttled request with an empty bucket.
  async function get(url) {
    return schedule(async () => {
      let lastStatus = 0;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        stats.requests += 1;

        try {
          const response = await fetch(url, { headers });

          if (response.ok) {
            return parsePayloads(await response.text());
          }

          lastStatus = response.status;
          await response.text();

          if (response.status === 403 || response.status === 429) {
            stats.throttled += 1;
          } else if (response.status >= 400 && response.status < 500) {
            // A genuine client error will not fix itself on retry.
            throw new Error(`${response.status} for ${url}`);
          }
        } catch (error) {
          if (error instanceof Error && /^\d{3} for /.test(error.message)) {
            throw error;
          }

          lastStatus = lastStatus || -1;
        }

        stats.retries += 1;
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }

      throw new Error(`gave up after ${MAX_ATTEMPTS} attempts (last status ${lastStatus}): ${url}`);
    });
  }

  return { get, origin, stats };
}

// Sweeps the five-minute buckets around a kickoff and returns every record for
// the fixture. `failures` is the count of buckets that never came back, so
// callers can refuse to write a pack built from partial data.
export async function sweepBuckets(client, { fixtureId, kickoff, feed }) {
  const requests = [];

  for (const offset of SWEEP_HOURS) {
    const at = new Date(kickoff + offset * HOUR_MS);
    const epochDay = Math.floor(at.getTime() / DAY_MS);
    const hour = at.getUTCHours();

    for (let interval = 0; interval < INTERVALS_PER_HOUR; interval += 1) {
      // The query param is lower-case `fixtureId`; the server silently ignores
      // any other spelling and hands back every fixture in the bucket.
      requests.push(
        client
          .get(
            `${client.origin}/api/${feed}/updates/${epochDay}/${hour}/${interval}?fixtureId=${fixtureId}`,
          )
          .then((records) => ({ ok: true, records }))
          .catch(() => ({ ok: false, records: [] })),
      );
    }
  }

  const results = await Promise.all(requests);

  return {
    failures: results.filter((result) => !result.ok).length,
    records: results
      .flatMap((result) => result.records)
      .map((raw) => raw.Update ?? raw)
      .filter((record) => record.FixtureId === fixtureId),
  };
}
