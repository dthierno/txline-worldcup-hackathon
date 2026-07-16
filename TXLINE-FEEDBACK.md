# TxLINE API feedback

Running notes from building PredGame on TxLINE devnet, kept as we build (the
submission form asks what we liked most and where we hit friction — this is
that, with dates and specifics). Sibling document: [API-WISHLIST.md](API-WISHLIST.md)
for the endpoint ideas each gap produced.

## What we liked most

- **The revision model is genuinely correct.** Every real-world event emits
  records sharing one action `Id` (`Confirmed: false → true`), disallowed
  events get an `action_discarded` with the same id, and re-graded events get
  `action_amend`. Once we merged by id, goal attribution measured 96%+ across
  the tournament — including VAR-disallowed goals correctly carrying no
  scorer. Most feeds hand you a mutable aggregate; this one hands you the
  actual history. (2026-07-15)
- **Demarginated prices out of the box.** `TXLineStablePriceDemargined` means
  the `Pct` values sum to ~100 and can be used as fair probabilities
  directly — our whole points economy and Poisson scoreline model price off
  them with zero overround handling. (2026-07-10)
- **One normalized schema across everything.** Fixtures, scores and odds all
  speak the same PascalCase JSON over plain HTTP + SSE. Our browser consumes
  stream records with the same normalizer the server uses for snapshots.
  (2026-07-08)
- **The per-half stat banks.** First/second-half splits riding on every score
  record let us settle first-half markets at the break with no extra calls.
  (2026-07-16)
- **`PlayerStats` on `game_finalised`.** An authoritative per-player summary
  (goals, cards, penalties, own goals) at the final whistle is exactly what a
  settlement engine wants as its source of truth. (2026-07-12)
- **A live OpenAPI spec at `/docs/docs.yaml`.** Being able to check whether a
  field exists instead of inferring from observed traffic settled several
  arguments (assists, market families) in minutes. (2026-07-15)
- **Live sub-minute latency.** During NOR–ENG we watched a goal go up, get
  VAR-reversed, and the score walk back — the feed made our UI look right
  because the data was right. (2026-07-11)

## Where we hit friction

- **Retention windows shaped our whole architecture.** Finished fixtures
  leave `/fixtures/snapshot` within hours and `/scores/historical` after two
  weeks; the only route to older matches is sweeping five-minute bulk
  buckets (~84 requests per fixture), which also drops `PlayerStats` from the
  finalised record. We ended up committing 6MB of recorded feeds into the
  repo to keep the app demonstrable after the tournament. (2026-07-15)
- **Throttling is indistinguishable from denial.** Parallel bucket sweeps get
  `403` with an HTML body — same code as a permissions failure, no
  `Retry-After`, not JSON. Our first harvester logged throttled buckets as
  "empty match" and we shipped a lossy dataset before catching it.
  (2026-07-15)
- **Silently ignored query params.** `?FixtureId=` (wrong case) returns the
  full bucket with HTTP 200; the correct `?fixtureId=` halves the payload. An
  error — or case-insensitive matching — would have saved a day of doubled
  downloads. (2026-07-15)
- **Numbers arrive as strings, and "NA" is a number.** `Pct:
  ["48.544","24.888"]` needs parsing everywhere, and unpriced lines publish
  `["NA","NA"]` rather than being omitted — every consumer needs the same
  finite-number filter or they build markets that pay `Infinity`.
  (2026-07-16)
- **`GameState` stays `"scheduled"` forever on devnet**, so match phase must
  be derived from `StatusId` (2/4 halves, 3 HT, 5 FT, 6–9 ET, ≥10 pens). Fine
  once known, but it costs every newcomer an afternoon. (2026-07-10)
- **Two-week-old knowledge goes stale fast.** Group-stage fixtures looked
  permanently lost until we found the bulk endpoints; the difference between
  "data doesn't exist" and "data aged out of this endpoint" is not visible
  from any error message. (2026-07-15)
- **No player identity beyond id + name.** Joining photos or any external
  data means fuzzy name-matching into a second id space, then reconciling
  picks back onto TxLINE ids before settlement. A published external-id
  crosswalk would erase the whole problem class. (2026-07-16)
