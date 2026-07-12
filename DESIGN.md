# PredGame design language

Distilled from the homepage (`src/components/home-page.tsx` + `src/app/globals.css`)
as of July 2026. Read this before styling any new surface, so pages feel like one
product. The match page redesign (`/demo/match/[fixtureId]`) is the first page
rebuilt against this document.

## 1. Foundations

### Mood
Dark-only, broadcast-style sports UI (closest cousin: FotMob / OneFootball).
Rich saturated color is reserved for *identity* (team glows, flags, the rainbow
brand sweep) and *state* (green won, red live/lost, amber pending). Everything
else is a quiet near-black neutral so the color pops.

### Color tokens (`:root` + `.dark` in globals.css)
| Token | Value | Use |
| --- | --- | --- |
| `--background` | `oklch(0.145 0 0)` ≈ `#0b0b0d` | page |
| `--surface` | `#101014` | legacy card fill |
| `#141419` | (literal) | raised interactive fills: day toggles, hover targets |
| `#0d0d13` | (literal) | inner "pitch" panel of prediction cards |
| `#0f0f15` | (literal) | league ticket cards |
| `--won` | `#4ade80` | success, points, picks, "Predict." highlight |
| `--lost` | `#f87171` | losing, live minute text |
| `#ef4444` | (literal) | live pulsing dot |
| `--open` / amber `#fbbf24` | pending, favourite star, trophy icon |
| `--brand` | `#4f8cff` | links, focus accents (used sparingly) |
| `--muted-foreground` | `oklch(0.708 0 0)` | secondary text |
| ray palette | orange→red→pink→purple→blue→cyan→green→lime→yellow | hero stripes, logo gradient sweep |

### Typography
- Family: **Open Runde** (`--font-open-runde`) everywhere; Geist Mono unused on
  fan surfaces.
- Scale is small and dense: 11–13px labels, 14–15px body, 16–20px scores,
  30px logo. Headline moments (hero) go much bigger.
- Weight carries hierarchy more than size: 500 labels, 600–700 values/names,
  750 for the card competition line. Muted color + uppercase + letter-spacing
  (`0.02–0.08em`) marks section labels.

### Shape
- Corners are **generous and borderless**: 16px (day headers), 18px (tickets),
  20px (card inner panels), 24px+ (hero), 999px pills. Radius signals surface
  importance; borders were deliberately removed from fills (`border: none`) —
  separation comes from background steps, not strokes.
- The only "stroke" idiom left: a 1px white 10% ring on flags
  (`box-shadow: 0 0 0 1px rgba(255,255,255,.1)`) and white 5%/10% fills for
  score boxes.

### Layout
- Content column: `main` max-width 1088px (header inner 1040px), 24px side pad.
- Two-column pattern: `grid-template-columns: minmax(0, 620px) minmax(0, 1fr)`,
  `gap: 26px 28px`, sticky right rail (`position: sticky; top: 20px`), columns
  start at the same y. Single column under 900px.
- Vertical rhythm: 12–18px gaps; 18px between major bands (tab bar spacing).

## 2. Signature patterns

### The prediction card (`pc-*`)
The heart of the visual identity:
- **Diagonal band header** (`pc-head`): blue World Cup band, round black icon
  buttons (25px, `#000`, hover `#1c1c22`), 750-weight competition text.
- **Inner panel** (`pc-panel`, `#0d0d13`, radius 20): per-team **radial color
  glows** from `--glow-home` / `--glow-away` (see `teamGlow` map in
  home-page.tsx), animated 11–15s, desynced per card, `prefers-reduced-motion`
  disables. Content sits above via z-index.
- **Flags**: flagcdn.com `w80` images, 52px, radius 14, white ring. `teamIso` /
  `teamFlag` maps translate names/codes to ISO.
- **Score boxes**: 46×44, white 5% fill, white 10% border, radius 10. Finished
  matches join the two boxes into one pill (outer corners only) with a green
  **points badge** circle sitting on the seam and an "FT 1 - 2" line below.
- **Why-labels**: "EXACT SCORE!" / "RIGHT WINNER" / "GOOD CALLS!" — `--won`,
  ~11px, 700, uppercase, letter-spaced. Payoff moments get exclamation marks.
- **Form strips**: five 5px dots, green/red/grey (+dim unknown), real data only.

### Day headers (collapsible)
`pred-day-toggle`: `#141419` fill, radius 16, **no border**, hover lightens to
`#1a1a21`; amber **solid** trophy 18px; day name 14px/600; one neutral fraction
pill (`1/3 predicted`); chevron rotates 180° when open (`data-panel-open`).
Built on the shadcn preset Collapsible (Base UI). Old finished games live in a
separate "Past results" toggle row, never collapsed by day.

### Pills
One shape (`border-radius: 999px`), three tones:
- neutral: `rgba(255,255,255,0.08)` fill, muted text, 11px/600 (`pred-day-pill`)
- won-tinted: `color-mix(--won 14%)` fill + `--won` text (success labels)
- live badge: dark green fill `#10321d`, `--won` text, border `#1f6b3d`
Counts read as words ("2 games", "1/3 predicted"), never bare "1/1".

### Live state
Red pulsing 6px dot (`pc-live-pulse`, 1.5s) + red minute (`#f87171`, 12px/700).
Phase words are **spelled out**: "Halftime", "Extra time break", never "HT"/"ET".
The dot only pulses while the ball is actually in play (no dot at halftime).

### Leaderboard rows (`pred-board`)
Rank number, name, right-aligned green points; "You" row highlighted; simulated
rivals are labelled "· simulated" — the product never fakes data silently. Every
derived or simulated signal gets a muted footnote explaining provenance.

## 3. Motion
- Ambient loops are slow and cheap: glow drift 11–15s (opacity/transform only),
  logo gradient sweep 6s, hero phase cycle 3s.
- Micro-interactions: 0.16–0.2s ease (hover fills, icon buttons,
  `active: scale(0.92)`).
- Every animation has a `prefers-reduced-motion: reduce` fallback.

## 4. Voice
Short, second-person, fan-first: "Got a code from a friend? Jump straight in."
Payoffs celebrate ("Exact score!"); footnotes stay honest about data sources
(TxLINE vs simulated). No jargon, no abbreviations in labels.

## 5. What the old match page got wrong (pre-redesign)
Single 700px-wide column of bordered `--surface` cards (radius 12, 1px border),
plain-text centered header, debug strings in the hero ("Score source",
"Fixture #18222446", stream status), tables with hairline row borders, "HT"-era
terseness. Functional, but it reads as an engineering console next to the
homepage. The v2 match page maps every one of those surfaces onto the patterns
above (glow header panel, borderless 16px+ fills, pills, collapsible sections,
two-column with sticky rail, provenance tucked into a data section).
