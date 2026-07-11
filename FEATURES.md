# Fan Forecast — Feature & Knowledge Handoff

TxLINE-powered World Cup 2026 prediction app for the TxODDS "Consumer and Fan
Experiences" hackathon (Superteam Earn, winners July 29, 2026). Dev server:
`npm run dev -- --port 3001`. This file documents everything built after the
original mission brief, plus hard-won TxLINE data knowledge. Read AGENTS.md
first (non-standard Next.js version).

## Routes

- `/` — home: animated hero ("PredGame" sr-only h1), tabbed layout
  (Predictions | Matches | Knockout, default Predictions), day-grouped match
  cards with live scores, local league, knockout bracket
- `/match/[fixtureId]` — deep-linkable match page (works for any TxLINE id)
- `/demo/goal-calls` — mock harness for the live-calls flow (fast clock,
  per-visit random keys so stored answers never leak between sessions)
- `/api/txline/*` — server proxies (credentials never reach the browser)
- `/api/txline/scores/:id/lineups` — lineups extracted from score feeds
- `/api/stories` — Google News RSS headlines (site:fifa.com), 10-min cache,
  last-good fallback

## Core features

### Predictions & settlement (`src/lib/prediction-engine.ts`, `prediction-store.ts`)
- localStorage only (no DB by design). Keys: `fan-forecast.predictions.v1`,
  `fan-forecast.settlements.v1`, `fan-forecast.goalcalls.v1`.
- Markets: exact score (5), winner (3, odds-scaled — below), over/under goals
  2.5 / corners 8.5 / cards 3.5 (2 each), first scorer (6).
- **Odds-aware scoring**: saving a prediction stamps `oddsAtSave` (TxLINE 1X2
  decimals = 100/probability). Winner payout = round(3 × odds), floor 3,
  cap 30. Deterministic; pick label shows "@ 5.35".
- Locks at kickoff (30s clock via `useNow`). Over lines settle live once
  passed; unders/winner/exact only at full time. Unknown first scorer on a
  goal → market **voids** (never guess).
- Settlement finality is driven by the `game_finalised` feed record, NOT
  gameState and NOT the 4h window alone.
- Final settlements persist to localStorage so the home page shows points
  without refetching replays.

### Live calls (`GoalCallsSection` in `match-page.tsx`, extractors in `txline-normalize.ts`)
Micro-predictions during live matches, one shadcn Dialog popup at a time with
an 8s countdown (`CALL_WINDOW_MS`), answers stored as option-index strings
(legacy "goal"/"no_goal" still read), +2 points per correct call
(`GOAL_CALL_POINTS`), full history list per match. Four kinds, all mapped to
one `LiveUiCall` shape (adding a kind = extractor + mapping):
- **Goal call** (`extractGoalCalls`): scout `possible {Goal:true}` raise →
  stood if the score advances, cleared by `{Goal:false}`.
- **Next corner** (`extractCornerCalls`): opens at kickoff and after each
  corner; resolved by the next corner's participant; final open call voids.
- **Added time** (`extractAddedTimeCalls`): over/under 3.5 min per half,
  settled exactly by the `additional_time` record's Minutes.
- **Penalty** (`extractPenaltyEvents`): "scored or missed?", settled by
  `penalty_outcome` (Outcome Missed/…) or a score advance; carries the VAR
  outcome (`var_end`) when a review happened.

### Live data (`src/components/match-page.tsx`)
- SSE via `EventSource` on `/api/txline/{scores,odds}/stream` while inside a
  4h window post-kickoff AND not `game_finalised`; filtered by FixtureId,
  deduped by Seq; cleanup on unmount/fixture change.
- 60s polling fallback re-fetches all detail data in place (no loading
  flash — `loadedFixtureRef` distinguishes refresh from navigation). Home
  match cards poll live scores with a since-cursor (not the full match).
- **Scout corrections applied first** (`applyScoutCorrections`) so stats,
  calls and feed all see the corrected record of play (see data notes).
- **Live match clock**: `deriveMatchClock` (latest Clock + StatusId) +
  `formatLiveMinute` ("37'", "45+2'", "90+4'") + `formatMatchPhase`; header
  chip shows minute · phase while live, driven by `useNow` elapsed time on
  top of the last record's clock.
- Stats panel: possession % (ball-in-play time), shots + on target (amend-
  aware), corners/cards, fouls conceded (= opponent free kicks), penalties
  awarded, throw-ins, goal kicks.
- **Momentum chart** (`extractMomentum`): attack pressure per 5-min bucket,
  home above / away below the midline. Weights: attack 1, danger 2,
  high_danger 3, shot 3, corner 2 (shots/corners deduped by eventId).
- **Match info card** (`extractMatchInfo`): venue type, weather + pitch
  conditions, jersey colors (swatches — CSS named colors like "aqua"/"red"),
  kickoff team.
- Lineups with real player names, **GK/DEF/MID/FWD badges** (positionId
  34/35/36/37), sorted starters-then-position, subs (▲/▼ + minute), ⚽ per
  goal.
- Feed (`getDisplayUpdates`): goals with scorer, cards with player,
  substitutions, real VAR checks, additional time, **penalty story**
  (awarded → VAR review → decision → scored/missed), **injuries with player
  name + outcome** (one line per event via eventId dedupe), half-time and
  full-time score markers, pre-match scene lines (kits, kickoff team,
  conditions, pitch, neutral venue — no minute prefix on those).

### Verification (`/api/txline/scores/:id/validation`, `/api/txline/odds/:id/validation`)
- **v3 multiproofs** (`stat-validation-v3`): two compressed multiproof calls
  cover all four markets (statKeys 1–4 and 5–8) and return the **proven stat
  values** — the panel shows "Goals: proven 2-0" etc. Falls back to legacy
  per-pair `stat-validation` calls if v3 errors (`proofMode` says which ran).
- **Odds validation** (`/api/odds/validation?messageId&ts`): Merkle proof for
  a single odds record. Our route proves the fixture's **closing full-match
  1X2 line** (latest pre-match record — what predictions settle against),
  shown as its own ✓ row. Never claims on-chain submission.

### Odds
- Snapshot 1X2 (full-match period preferred — TxLINE also quotes 1X2 per
  half) + compact movement series (server-side: full-match 1X2 only, ≥0.5pp
  moves, capped 30 points — never ship 64k raw records).
- **Odds board** (`buildOddsBoard`, served on the odds/updates route): latest
  full-period prices per market family — 1X2, total-goals over/under lines,
  Asian handicap lines (.5 lines only shown, capped 6). `board` = latest
  prices (live view); `closingBoard` = latest pre-match prices (shown for
  finished matches — final in-play prices are just the settled result).
- Home match cards show decimal 1X2 chips for upcoming fixtures.

### UI system
- Tailwind v4 + shadcn/ui preset `b27GdBA8` — **Base UI primitives, not
  Radix**: composition is `render={<Link/>}` + `nativeButton={false}`, not
  `asChild`. Dark-only (`dark` class on html). Custom tokens: `--brand`
  (blue), `--won/--lost/--open`; text-muted = `--muted-foreground` (shadcn's
  `--muted` is a background).
- Home is tabbed (shadcn Tabs, Base UI): Predictions (default) | Matches |
  Knockout — tests must click a tab before asserting its content.
- `motion` (framer-motion successor): hero panel slider, feed entrances;
  `MotionConfig reducedMotion="user"`. Animation craft rules in
  `.agents/skills/`.
- Match cards: day-grouped, per-nation glow colors (all 48 teams), live
  score bar with match minute on ongoing matches.
- Bracket: FotMob-style with flagcdn circular flags, connector paths,
  eliminated strikethrough. Static sample data except FRA-MAR (real result).

## TxLINE data knowledge (critical — verified against devnet)

- **GameState never becomes "finished"** on devnet. `game_finalised` action is
  the authoritative end; `halftime_finalised` marks the break (both carry a
  `Score` object with H1/HT/H2/Total per participant).
- **StatusId map**: 1 pre-match, 2 first half, 3 half-time, 4 second half,
  5 full time (awaiting finalisation), 100 finalised. Nearly every record
  carries `Clock {Running, Seconds}` (H2 starts at 2700s); `Kickoff.Team`
  says who kicks off.
- One real event → multiple feed records sharing `Id` (normalized `eventId`):
  first sibling is often empty (no Participant/Data), confirmed ones carry
  payload. Always merge by eventId before counting or reading players.
- **Scout corrections are real and must be applied** (`applyScoutCorrections`):
  - `action_discarded` shares its `Id` with the event it cancels — FRA-MAR
    contained a **disallowed Morocco goal**, a discarded corner and throw-in.
    Filter all records with a discarded eventId.
  - `action_amend` does NOT share the target's Id; it links by
    `Data.Action` + `Previous.Clock.Seconds` and carries Previous/New field
    sets (observed: shot OnTarget→OffTarget, free kick Attack→Danger). Patch
    the matching sibling's Data.
- Live stream filler records (throw_in etc.) have **empty Stats** → would
  regress score to 0-0; `fillUnknownStats` carries forward (`statsKnown`).
- Stat keys: 1/2 goals, 3/4 yellows, 5/6 reds, 7/8 corners (odd=participant1);
  banks 1001–1008 = first half, 2000s = halftime snapshot, 3001–3008 = second
  half (1000s+3000s = full match), 4000s–7000s ET/pens (zero in regulation).
  Normalizer exposes `halfStats`.
- **Lineups records contain real player names** (`Lineups[].lineups[].player
  .preferredName`), shirt numbers, starters, `positionId` (34 GK, 35 DEF,
  36 MID, 37 FWD), dateOfBirth, country. `player.normativeId` === goal
  `Data.PlayerId` (verified) → first-scorer settlement works. unitId is
  always 0 and `starred` unused on devnet.
- **No player/team ratings anywhere in the API** (searched scores + odds
  payloads and probed endpoints). Closest: `PlayerStats` on late records
  (cumulative `{goals, yellowCards}` per player id per team, e.g. on
  `game_finalised`) and the lineup metadata above. A ratings feature would
  have to be derived client-side from events.
- Substitution records carry NO Participant — resolve team via lineup
  membership. Some sub events never get player IDs (drop them).
- `injury` records: Data.Participant + Data.PlayerId + Data.Outcome
  (OnPitch | NotReturning) spread across siblings — index by eventId.
- Penalty drama records: `penalty` (raise), `var {Type:"Penalty"}`,
  `var_end {Outcome:"Stands"}`, `penalty_outcome {Outcome:"Missed"}`.
  France missed a penalty at 25' in FRA-MAR — full sequence verified.
- Shot `Data.Outcome`: OnTarget | Blocked | OffTarget | Woodwork (absent on
  unconfirmed siblings). Goal Data: only GoalType + PlayerId — **no assists
  anywhere in the API**.
- `possible` records: two kinds. With `Data.VAR === true` = real VAR review.
  WITHOUT it (Goal/Penalty/Corner booleans, raised then cleared seconds later,
  ~26 pairs/match) = scout uncertainty bookkeeping — never display those (but
  they power the goal-call feature). `additional_time` has Minutes.
- Scene records: `weather`/`pitch` (Data.Conditions arrays, re-reported when
  they change), `venue` (Data.Type "neutral"), `jersey` (Participant +
  Data.Color), `kickoff_team`, `players_warming_up`, `players_on_the_pitch`.
- Possession-phase actions (safe/attack/danger/high_danger `*_possession`)
  carry `Possession: 1|2` + Participant + Clock; % from clock deltas
  (`computePossessionSplit`), momentum from weighted counts
  (`extractMomentum`). Free kicks/throw-ins/goal kicks carry Participant and
  a danger-type field (`FreeKickType`/`ThrowInType`: Safe|Attack|Danger).
- Odds updates: `Ts`, `SuperOddsType`, `Pct` (strings, can be "NA"), `Prices`
  (decimal ×1000, **empty array = market suspended — skip**),
  `MarketParameters` (`line=2.5`, quarter lines exist), `MarketPeriod`
  (`half=1`, `et`, `penalties`, null = full match), `InRunning`. Families on
  devnet: `1X2_PARTICIPANT_RESULT` (PriceNames part1/draw/part2),
  `OVERUNDER_PARTICIPANT_GOALS` (over/under),
  `ASIANHANDICAP_PARTICIPANT_GOALS` (part1/part2). Single bookmaker
  `TXLineStablePriceDemargined`. **About half the 1X2 records are half=1 —
  always filter by MarketPeriod.**
- Fixture snapshot stage can be a numeric group id — merge preserves seed
  labels (`mergeFixtures`). **Past fixtures roll OFF the snapshot** (FRA-MAR
  disappeared after ~2 days); deep links keep working via the seed list and
  the historical replay endpoint.
- Historical replay preferred over snapshot for finished games (snapshot can
  be stale, e.g. 0-1 vs real 0-3). Never display snapshot finals on home.

### Official API surface (spec v1.5.6 — discovered 2026-07-11)

**Swagger UI now lives at `{TXLINE_API_ORIGIN}/docs`** (spec:
`/docs/docs.yaml`). Public docs: https://txline.txodds.com/documentation and
https://github.com/txodds/tx-on-chain. Full endpoint list:
- Auth: `POST /auth/guest/start` (guest JWT), `POST /api/token/activate`
  (Solana subscribe tx → API token), `GET /api/guest/purchase/quote`.
  **Guest JWTs expire after 30 days** — if TxLINE calls start returning 401
  near the demo date, re-acquire via `auth/guest/start`. Free World Cup tier
  = real-time odds sampled every 60s.
- Fixtures: `snapshot`, `updates/{epochDay}/{hourOfDay}` (windowed),
  `validation?fixtureId&timestamp` (Merkle proof of a fixture record; the ts
  param is optional, defaults to now), `batch-validation`.
- Odds: `snapshot/{id}`, `updates/{id}`,
  `updates/{epochDay}/{hourOfDay}/{interval}` (5-min windows, optional
  `?fixtureId=` filter), `stream`, **`validation?messageId&ts`** (proof for
  one odds record — works, used by our odds-verification row).
- Scores: `snapshot/{id}`, `updates/{id}`,
  `updates/{epochDay}/{hourOfDay}/{interval}`, `historical/{id}`, `stream`,
  `stat-validation` (legacy pair mode + **V2 mode**: `statKeys=1,2,7,8`
  comma list, N-dimensional), **`stat-validation-v3`** (`statKeys` up to 5,
  compressed multiproof; response: `statsToProve[].stat.{key,value,period}`,
  `multiproof.hashes[]`, `subTreeProof`, `mainTreeProof` — proven values
  included; period 100 = final).
- Still absent: players/ratings/participants/competitions endpoints — **no
  ratings in the API** remains true in v1.5.6.

## Ops gotchas (memory-backed)

- `npm run build` while `next dev` runs **wedges the dev server** (shared
  `.next`). Also: after CSS edits the dev server can serve a **stale CSS
  chunk under the same URL** (new sections render unstyled/invisible). Fix
  both: kill dev, `rm -rf .next`, restart, hard-reload browser.
- Session root is `work/`, app is `work/fan-predictions-app/` — register MCP
  servers with `--scope user` and install skills to `~/.claude/skills/`.
- chrome-devtools MCP is configured (user scope) — use it for the
  code → screenshot → compare → fix loop; check console after UI changes. If
  it reports "browser already running", kill the stale profile:
  `pkill -f chrome-devtools-mcp/chrome-profile`.
- React StrictMode double-runs effects in dev — timer-driven demo loops need
  raise-once guards (see `/demo/goal-calls`).

## IP boundaries (deliberate, keep them)

- No FIFA assets (logo, trophy, mascots, story videos), no FotMob assets/code,
  no Apple SF font, no FIFA Storyteller key (one appears in their JS bundle —
  do not use it). Linking out to fifa.com is fine; their private APIs are not.
- Flags via flagcdn.com (public domain content). WC26 "branding" is original
  artwork (palette/geometry inspiration only). Stories = RSS headlines +
  links with attribution.

## Commands & gates

```bash
cd fan-predictions-app
npm run dev -- --port 3001
npm run test -- --run   # 38 tests
npm run lint
npm run build           # stop dev first!
```

Commit at green checkpoints without asking (user-granted); never push.

## Remaining work (data is ready)

1. Half-split toggle in stats panel (`halfStats` already normalized)
2. Odds shown next to winner options in the prediction form
3. TxLINE-powered story cards in the stories rail (scores/odds swings)
4. Jersey-color theming of match pages (colors in `extractMatchInfo`);
   formation view could group by position bands (no formation string in API)
5. Fold live-call points into the home league total
6. Global live-call toast on the homepage during live matches
7. Demo prep: predict upcoming matches so "Your pick" states show; verify
   live flow during a real match window
