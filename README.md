# Fan Forecast

Fan Forecast is a web-only football prediction league demo for the TxLINE World Cup hackathon. It is built around TxLINE's World Cup free tier and is intentionally database-free for now.

## What Works

- Official TxLINE-covered World Cup fixtures, with docs-backed seed fallback
- Featured match: `fixtureId 18209181`, France vs Morocco, July 9, 2026 at 20:00 UTC
- Private league UI and live leaderboard
- Local prediction persistence with `localStorage`
- Prediction locking/editing demo flow
- Score, winner, total goals, and first-goal scoring
- TxLINE score snapshots, score update events, and odds snapshots wired into the match view
- Optional replay controls for goals, cards, corners, and full-time settlement demo narration
- Server-side TxLINE API proxy routes so tokens are not exposed in browser code
- In-app TxLINE diagnostics showing fixture source, score source, updates source, odds source, network, and feed mode
- Demo fallback when TxLINE credentials are not configured or a live request fails

## TxLINE Setup

Copy `.env.example` to `.env.local` and fill in the values after activating your TxLINE free tier:

```bash
TXLINE_NETWORK=devnet
TXLINE_API_ORIGIN=https://txline-dev.txodds.com
TXLINE_JWT=your_guest_jwt
TXLINE_API_TOKEN=your_activated_api_token
```

If the env vars are missing, the app still runs using the TxLINE docs schedule seed and the local demo replay. With `TXLINE_JWT` and `TXLINE_API_TOKEN` present in `.env.local`, the server routes call TxLINE directly without exposing either credential to browser JavaScript.

If the validator has created `../txline-validation/out/txline-devnet-result.json`,
import it without printing secrets:

```bash
npm run txline:env
```

## API Routes

- `GET /api/txline/status` reports whether the app is using configured TxLINE credentials or demo fallback.
- `GET /api/txline/fixtures` returns TxLINE fixture snapshots when configured, otherwise the docs-backed fixture seed.
- `GET /api/txline/scores/:fixtureId` returns normalized score stats when configured.
- `GET /api/txline/scores/:fixtureId/updates` returns normalized score update events when configured.
- `GET /api/txline/odds/:fixtureId` returns normalized 1X2 probabilities and available odds markets when configured.

## Hackathon Demo Flow

1. Open the app and show the France vs Morocco featured match.
2. Show the `TxLINE Status` card first. In live mode it proves fixtures, score snapshot, score updates, and odds are coming through the proxy routes.
3. Open the `Live rounds` tab to show next goal, next card, and higher/lower corners backed by the current TxLINE score stats and odds snapshot.
4. Use `Run Demo Replay` or `Next event` only when you want to narrate how goals, cards, corners, and full-time settlement affect the leaderboard during judging.
5. Point judges to the `TxLINE Status` card to prove whether the app is using live TxLINE credentials or docs-seed fallback.

## Development

```bash
npm install
npm run dev -- --port 3001
```

Open `http://localhost:3001`.

## Verification

```bash
npm run lint
npm run test
npm run build
```
