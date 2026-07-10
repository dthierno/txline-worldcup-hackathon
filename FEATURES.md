# Fan Forecast — Feature & Knowledge Handoff

TxLINE-powered World Cup 2026 prediction app for the TxODDS "Consumer and Fan
Experiences" hackathon (Superteam Earn, winners July 29, 2026). Dev server:
`npm run dev -- --port 3001`. This file documents everything built after the
original mission brief, plus hard-won TxLINE data knowledge. Read AGENTS.md
first (non-standard Next.js version).

## Routes

- `/` — home: animated hero, stories rail, day-grouped match cards, local
  league, knockout bracket
- `/match/[fixtureId]` — deep-linkable match page (works for any TxLINE id)
- `/api/txline/*` — server proxies (credentials never reach the browser)
- `/api/txline/scores/:id/lineups` — lineups extracted from score feeds
- `/api/stories` — Google News RSS headlines (site:fifa.com), 10-min cache,
  last-good fallback

## Core features

### Predictions & settlement (`src/lib/prediction-engine.ts`, `prediction-store.ts`)
- localStorage only (no DB by design). Keys: `fan-forecast.predictions.v1`,
  `fan-forecast.settlements.v1`.
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

### Live data (`src/components/match-page.tsx`)
- SSE via `EventSource` on `/api/txline/{scores,odds}/stream` while inside a
  4h window post-kickoff AND not `game_finalised`; filtered by FixtureId,
  deduped by Seq; cleanup on unmount/fixture change.
- 60s polling fallback re-fetches all detail data in place (no loading
  flash — `loadedFixtureRef` distinguishes refresh from navigation).
- Stats: possession % (ball-in-play time from possession-phase records),
  fouls (= opponent free kicks), shots + shots on target (Outcome merged
  across sibling records), corners/cards; FotMob-style panel with pills.
- Lineups with real player names, subs (▲/▼ + minute), ⚽ per goal scored.
- Feed: goals with scorer names, yellow cards with player, substitutions with
  names, VAR "possible" checks, additional time; newest first, scrollable,
  Motion entrance animations.

### Verification (`/api/txline/scores/:id/validation`)
- Requests Merkle proofs for ALL four stat pairs in parallel: goals (1,2),
  yellows (3,4), reds (5,6), corners (7,8). Panel lists each market with ✓
  and proof-node count. Never claims on-chain submission.

### Odds
- Snapshot 1X2 + compact movement series (server-side: full-match
  1X2 only, ≥0.5pp moves, capped 30 points — never ship 64k raw records).
- Home match cards show decimal 1X2 chips for upcoming fixtures.

### UI system
- Tailwind v4 + shadcn/ui preset `b27GdBA8` — **Base UI primitives, not
  Radix**: composition is `render={<Link/>}` + `nativeButton={false}`, not
  `asChild`. Dark-only (`dark` class on html). Custom tokens: `--brand`
  (blue), `--won/--lost/--open`; text-muted = `--muted-foreground` (shadcn's
  `--muted` is a background).
- `motion` (framer-motion successor): hero panel slider (3 panels, springs,
  `AnimatePresence`), feed entrances; `MotionConfig reducedMotion="user"`.
- Animation craft rules applied (skills in `.agents/skills/`): 80ms staggers,
  strong ease-out `cubic-bezier(0.23,1,0.32,1)`, GPU props only, hover gated
  behind `(hover:hover) and (pointer:fine)`, `prefers-reduced-motion` block.
- Hero: sunburst pattern (variant system in `Hero`), WC26-inspired original
  branding (26 badge, host flags), floating top-4 nation flags, CTA.
- Match cards: day-grouped (Today/Tomorrow/dates), team-color radial glows,
  center slot = verified FT score | your pick | predict prompt.
- Bracket: FotMob-style with flagcdn circular flags, connector paths,
  eliminated strikethrough. Static sample data except FRA-MAR (real result).

## TxLINE data knowledge (critical — verified against devnet)

- **GameState never becomes "finished"** on devnet. `game_finalised` action is
  the authoritative end; `halftime_finalised` exists too.
- One real event → multiple feed records sharing `Id` (normalized `eventId`):
  first sibling is often empty (no Participant/Data), confirmed ones carry
  payload. Always merge by eventId before counting or reading players.
- Live stream filler records (throw_in etc.) have **empty Stats** → would
  regress score to 0-0; `fillUnknownStats` carries forward (`statsKnown`).
- Stat keys: 1/2 goals, 3/4 yellows, 5/6 reds, 7/8 corners (odd=participant1);
  banks 1001–1008 = first half, 3001–3008 = second half (sum = full match),
  2000s ≈ halftime snapshot, 4000s–7000s ET/pens. Normalizer exposes
  `halfStats`.
- **Lineups records contain real player names** (`Lineups[].lineups[].player
  .preferredName`), shirt numbers, starters. `player.normativeId` === goal
  `Data.PlayerId` (verified) → first-scorer settlement works.
- Substitution records carry NO Participant — resolve team via lineup
  membership. Some sub events never get player IDs (drop them).
- Shot `Data.Outcome`: OnTarget | Blocked | OffTarget | Woodwork (absent on
  unconfirmed siblings). Goal Data: only GoalType + PlayerId — **no assists
  anywhere in the API**.
- `possible` records = VAR flags (Goal/Penalty/RedCard/YellowCard/Corner
  booleans). `additional_time` has Minutes. venue/pitch/weather/jersey exist.
- Possession-phase actions (`*_possession`) carry `Possession: 1|2`; % is
  computed from clock deltas (`computePossessionSplit`).
- Odds updates: `Ts`, `SuperOddsType`, `Pct` (strings), `Prices` (decimal
  ×1000), `MarketParameters` (`line=2.5`), `MarketPeriod` (`half=1`).
- Fixture snapshot stage can be a numeric group id — merge preserves seed
  labels (`mergeFixtures`).
- Historical replay preferred over snapshot for finished games (snapshot can
  be stale, e.g. 0-1 vs real 0-3). Never display snapshot finals on home.
- No public endpoints beyond the known set (probed: odds/historical, players,
  fixtures/updates → 404). fixtures/batch-validation is 404 on devnet.

## Ops gotchas (memory-backed)

- `npm run build` while `next dev` runs **wedges the dev server** (shared
  `.next`). Also: after CSS edits the dev server can serve a **stale CSS
  chunk under the same URL**. Fix both: kill dev, `rm -rf .next`, restart,
  hard-reload browser.
- Session root is `work/`, app is `work/fan-predictions-app/` — register MCP
  servers with `--scope user` and install skills to `~/.claude/skills/`.
- chrome-devtools MCP is configured (user scope) — use it for the
  code → screenshot → compare → fix loop; check console after UI changes.

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
npm run test -- --run   # 29 tests
npm run lint
npm run build           # stop dev first!
```

Commit at green checkpoints without asking (user-granted); never push.

## Remaining work (all UI; data is ready)

1. Half-split toggle in stats panel (`halfStats` already normalized)
2. Full odds market board (over/under lines + Asian handicap from snapshot)
3. Odds shown next to winner options in the prediction form
4. TxLINE-powered story cards in the stories rail (scores/odds swings)
5. Jersey-color theming, formation view (lineup positionId), live match clock
6. Demo prep: predict upcoming matches so "Your pick" states show; verify
   live flow during a real match window
