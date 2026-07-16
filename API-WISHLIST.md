# TxLINE API wishlist

Endpoint and data ideas for the TxLINE team, each grounded in something we
actually tried to build for PredGame during the World Cup hackathon, could not
do with the current API, and had to solve another way. Newest first; the
workaround column is what we shipped instead, so each entry doubles as a
real-world use case.

## Predicted / probable lineups (2026-07-16)

**What we wanted:** show fans a likely XI on the match page days before
kickoff, the way FotMob and SofaScore do.

**Why the API couldn't:** lineups arrive as `lineups` records on the score
feed roughly one hour before kickoff. There is no earlier signal — no
probable/projected lineup, no squad list per fixture, not even a roster
endpoint per team.

**Workaround:** we project each side's XI from our own recorded feeds —
majority starters across their last three matches, red-carded players
excluded — and label it "Predicted XI" until the official record lands.
Rumor-grade sources (SofaScore/FotMob predicted lineups, beat journalists)
have no legitimate API, which is exactly why a TxLINE endpoint here would be
differentiating.

**Idea:** a `/fixtures/{id}/squads` endpoint (tournament rosters exist weeks
ahead) and, if scout coverage allows, a `ProbableLineups` record type ahead of
the official one.

## Player images / media (2026-07-16)

**What we wanted:** player faces on the scorer boards and lineups.

**Why the API couldn't:** the feed identifies players by id and name only.
There is no photo, no country code, no external id mapping (Opta/FIFA/etc.)
to join against a media provider without fuzzy name-matching.

**Workaround:** api-football, matched by normalized name + shirt number —
which added a second id space we must reconcile at settlement time, and a
100-requests/day quota that took our boards down mid-development.

**Idea:** even just a stable external-id crosswalk on lineup players would
remove the fuzzy matching; hosted headshots would remove the dependency.

## Scorer, cards, corners and BTTS odds (2026-07-15)

**What we wanted:** price our player markets (first/anytime/last scorer,
booked, sent off) and side markets (BTTS, corners, cards lines) off real
TxLINE odds, like we do for 1X2, totals, handicap and first-half markets.

**Why the API couldn't:** the odds feed publishes exactly three
`SuperOddsType` families (`1X2_PARTICIPANT_RESULT`,
`OVERUNDER_PARTICIPANT_GOALS`, `ASIANHANDICAP_PARTICIPANT_GOALS`) from one
bookmaker. No player props, no corners/cards markets, no BTTS.

**Workaround:** an in-app pricing model — Poisson scorelines from the 1X2 +
O/U prices, scorer likelihood from position and shirt number, base rates for
penalty/own-goal specials.

**Idea:** player-prop and secondary markets would be the single biggest
unlock for consumer prediction apps on this feed.

## Assists (2026-07-14)

**What we wanted:** an assists board beside the goal scorers.

**Why the API couldn't:** soccer `PlayerStats` is exactly
`goals, shots, ownGoals, penaltyAttempts, penaltyGoals, yellowCards,
redCards`, and the goal action carries only the scorer's `Data.PlayerId`.
`Assists` exists in the basketball schemas only.

**Workaround:** pivoted the whole feature to a bookings board (booked /
sent-off player markets), settled from the card actions and `PlayerStats`.

## Full-history access for finished fixtures (2026-07-15)

**What we wanted:** replay any completed tournament match inside the app.

**Why the API couldn't:** `/scores/historical/{id}` only serves fixtures that
kicked off between two weeks and six hours ago, and `/fixtures/snapshot`
drops finished fixtures within hours. Older matches are only reachable by
sweeping `/scores/updates/{epochDay}/{hour}/{interval}` — ~84 requests per
fixture — and the reconstructed `game_finalised` record lacks the
`PlayerStats` block that the windowed endpoint includes. 26 early group
fixtures return nothing from any endpoint.

**Workaround:** a harvest script that swept the buckets for all 104 fixtures
and committed 77 rebuildable ones as gzipped packs into the app.

**Idea:** lift the retention window for finished fixtures (they are immutable
), or add `/scores/full/{fixtureId}`; either way include `PlayerStats` in
whatever the bulk path returns. The docs mention a `VirtualFixture` replay
flag — an endpoint to actually request a replayed fixture would make demos
and integration tests first-class.

## Smaller items

- **Per-player shots are declared but never populated** (2026-07-16). The
  spec's `SoccerPlayerStats` includes `shots`, but no devnet fixture we
  checked carries it, and shot actions have `Data.Outcome` only — no
  `PlayerId`. We built a "most shots" leaderboard for the stats tab and had
  to remove it. Either populate the field or add the player id to shot
  actions (which would also unlock shots-per-player props).
- **No foul or offside actions** (2026-07-16) — free kicks conceded are the
  only foul proxy, and offsides are absent entirely; both are staple match
  stats fans expect.
- **`fixtureId` query param is silently ignored when miscased** (2026-07-15).
  `?FixtureId=` returns the whole bucket with HTTP 200; we shipped a harvester
  that downloaded double the data before noticing. Reject unknown params or
  match case-insensitively.
- **Burst throttling answers 403 with an HTML page** (2026-07-15), no JSON
  body, no `Retry-After`, and the same status as a real permission error. Our
  first harvester recorded throttled buckets as "empty" because of it.
- **Unpriced odds lines are listed with `Pct: ["NA","NA"]`** (2026-07-16) —
  quarter lines (±0.25, ±0.75…) appear in the feed but never carry numbers.
  Omitting them (or a `priced: false` flag) would save every consumer the
  same filtering bug we hit.
- **Odds records have no `Seq`** (2026-07-15) — scores order by `Seq`, odds
  only by `Ts`. One ordering key across feeds would simplify clients.
- **`GameState` never leaves `"scheduled"` on devnet** (2026-07-10) — clients
  must derive match phase from `StatusId`, which works but contradicts the
  field's name.
