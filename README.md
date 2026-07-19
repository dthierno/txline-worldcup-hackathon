# PredGame

A free-to-play World Cup companion that turns watching into playing — built on
TxLINE for the TxODDS World Cup hackathon.

## Core idea

Most fans watch the World Cup with a phone in their hand, but all it shows them
is the score. PredGame turns the match into a game: before kickoff you predict
the result and player markets, then as it unfolds the match becomes a stream of
rapid **live calls** — _"goal in the next 8 minutes?"_, _"who scores next?"_,
_"booked?"_ — that **settle the instant TxLINE's feed confirms them**. You earn
points, climb a global leaderboard, and battle friends in private leagues that
tick up live. Free to play — no stake, just the fun and the bragging rights.

## What it does

- **Pre-match predictions** — scoreline, winner, over/under, anytime scorer,
  booked/sent-off, and side markets, priced off TxLINE's demarginated odds.
- **Live in-match calls** — scout "possible goal" moments, timed goal windows,
  next-goal, corners, added time, VAR — graded in real time off the feed.
- **Private leagues + a global leaderboard** that update live as calls settle.
- **Prediction bots** (Rocco / Vega / Chaos) that make their own picks and
  compete on the same board.
- **A Telegram bot** — link your account and a server-side poller DMs you the
  live calls during real matches; answer with one tap in the chat and it syncs
  straight to your web leaderboard, points and all, even with the app closed.
  `/demo` replays a scripted match so the loop is demonstrable any time.

## Technical highlights

- **Real-time settlement off TxLINE's revision model.** Every event emits
  records sharing one action `Id` (`Confirmed: false → true`); we merge by id,
  read the scorer/card `PlayerId` from sibling records, and treat
  `action_discarded` as a walk-back — so a VAR-disallowed goal correctly comes
  off the board and "booked" settles the moment a player is carded.
- **Demarginated odds as fair probabilities.** `TXLineStablePriceDemargined`
  `Pct` values sum to ~100, so the entire points economy and a Poisson
  scoreline model price directly off them with zero overround handling.
- **Convex as one reactive source of truth.** The same data drives the web app
  and the Telegram bot — a tap on either surface lands in the same table and
  both update live via Convex reactivity; leaderboard totals are re-derived
  server-side so they can't be spoofed from a device.
- **An autonomous live-call engine.** A Convex cron polls the TxLINE feed,
  generates goal-window calls, fans them out to linked Telegram users, and
  grades them by watching the score — server-side, so it runs during real
  matches whether or not anyone has the app open. The bot's webhook is a Convex
  HTTP action (no always-on server).
- **One normalized feed schema across snapshots + SSE**, consumed by the same
  normalizer on the server and in the browser, behind server proxy routes so
  the TxLINE credentials never reach browser JavaScript.

## Business / monetization

Free-to-play prediction is the biggest on-ramp in sports and the proven
top-of-funnel operators use to acquire and retain casual fans — it reaches the
audience that will never open a sportsbook, works in every market (including
where real-money isn't legal), and keeps a fan engaged for all 90 minutes.
Private leagues drive social retention and virality; the Telegram bot is a
re-engagement channel that pulls fans back for every match. Same TxLINE feed, a
much wider addressable audience than a betting product.

## TxLINE endpoints used

Base URL `{TXLINE_API_ORIGIN}/api`, auth `Authorization: Bearer <JWT>` +
`X-Api-Token: <token>`, `cache: no-store` (SSE endpoints add
`Accept: text/event-stream`).

| Endpoint | Used for |
| --- | --- |
| `GET /scores/snapshot/{fixtureId}` | Current score, stats, per-half banks, cards/corners, and (at full time) `PlayerStats` — drives live scores, the server poller, and settlement. |
| `GET /scores/updates/{fixtureId}` | Live SSE event stream (goals, `yellow_card`/`red_card`, corners, VAR, substitutions, `game_finalised`); `?since=<seq>` cursor for deltas. Powers live calls + live player/goal/card attribution. |
| `GET /scores/historical/{fixtureId}` | Finished-match score history after the snapshot retention window. |
| `GET /odds/snapshot/{fixtureId}` | Demarginated 1X2 + market prices — the points economy and Poisson pricing. |
| `GET /odds/updates/{fixtureId}` | Live odds SSE (in-running price movement). |
| `GET /fixtures/snapshot` | World Cup fixture list / schedule. |
| `GET /scores/stat-validation` · `/scores/stat-validation-v3` · `/odds/validation` · `/fixtures/batch-validation` | Cross-checking feed values while building. |
| `GET /{scores|odds}/stream` | Combined SSE streams. |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Convex (reactive DB, HTTP
actions, cron, actions) · Clerk (auth) · Telegram Bot API · TxLINE (scores,
odds, fixtures over HTTP + SSE). Deployed on Vercel + Convex.

## Local development

Copy `.env.example` to `.env.local` and fill in your TxLINE free-tier
credentials (plus Clerk keys, the Convex URL, and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`):

```bash
TXLINE_NETWORK=devnet
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_JWT=your_guest_jwt
TXLINE_API_TOKEN=your_activated_api_token
```

```bash
npm install
npm run dev          # Next.js on :3000
npx convex dev       # Convex functions + live-call cron
```

Server proxy routes under `/api/txline/*` keep the TxLINE credentials off the
client. See [TXLINE-FEEDBACK.md](TXLINE-FEEDBACK.md) for our running notes on
the API, and [API-WISHLIST.md](API-WISHLIST.md) for the endpoint ideas each gap
produced.
