"use client";

import {
  AddTeamIcon,
  ArrowRight01Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import "./variations.css";

// Each concept is a full "Create + Join" pair. The markup below is identical
// for every one — the look comes entirely from the `.lv-<id>` wrapper class in
// variations.css, so the concepts stay directly comparable.
const VARIATIONS = [
  { id: "ticket", name: "Match Ticket", concept: "Perforated stub with a drifting World Cup colour wash" },
  { id: "scoreboard", name: "Stadium Scoreboard", concept: "LED dot-matrix panel, monospace readout" },
  { id: "pitch", name: "On the Pitch", concept: "Mowed turf stripes and white line markings" },
  { id: "glass", name: "Frosted Glass", concept: "Translucent panels over a colour wash" },
  { id: "brutalist", name: "Neo-Brutalist", concept: "Hard borders, offset shadow, flat colour" },
  { id: "aurora", name: "Aurora", concept: "Soft flowing mesh gradient" },
  { id: "gold", name: "Gold Final", concept: "Charcoal and gold, VIP finishing" },
  { id: "confetti", name: "Confetti", concept: "Celebration scatter, playful" },
  { id: "editorial", name: "Editorial", concept: "Light, minimal, generous whitespace" },
  { id: "jersey", name: "Team Kit", concept: "Jersey stripes and squad number" },
  { id: "boarding", name: "Boarding Pass", concept: "Fielded travel doc with a barcode stub" },
  { id: "terminal", name: "Terminal", concept: "CLI window, monospace, blinking cursor" },
  { id: "holo", name: "Trading Card", concept: "Holographic foil sheen and inner frame" },
  { id: "blueprint", name: "Blueprint", concept: "Cyan schematic grid on navy" },
  { id: "neon", name: "Neon Sign", concept: "Glowing tube outline" },
  { id: "news", name: "Newspaper", concept: "Newsprint texture, serif headline" },
  { id: "neumorph", name: "Neumorphism", concept: "Soft extruded panels" },
  { id: "vapor", name: "Vaporwave", concept: "Retro sunset gradient and neon grid horizon" },
  { id: "sticker", name: "Sticker", concept: "Glossy die-cut sticker, slight tilt" },
  { id: "comic", name: "Comic", concept: "Pop-art halftone and bold ink outline" },
];

// The live home-page cards, reusing the shipped `.league-card` classes from
// globals.css (static here — no dialogs) so this section mirrors production.
function HomeCards() {
  return (
    <div className="league-actions">
      <button className="league-card league-card--create" type="button">
        <span className="league-card-icon">
          <HugeiconsIcon icon={AddTeamIcon} strokeWidth={1.8} />
        </span>
        <span className="league-card-body">
          <span className="league-card-kicker">Private league</span>
          <span className="league-card-title">Create a league</span>
          <span className="league-card-desc">
            Set one up and invite your friends to predict.
          </span>
        </span>
        <span className="league-card-arrow" aria-hidden="true">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </span>
      </button>
      <button className="league-card league-card--join" type="button">
        <span className="league-card-icon">
          <HugeiconsIcon icon={Ticket01Icon} strokeWidth={1.8} />
        </span>
        <span className="league-card-body">
          <span className="league-card-kicker">Invite code</span>
          <span className="league-card-title">Join a league</span>
          <span className="league-card-desc">
            Got a code from a friend? Jump straight in.
          </span>
        </span>
        <span className="league-card-arrow" aria-hidden="true">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </span>
      </button>
    </div>
  );
}

function Pair({ id }: { id: string }) {
  // Only the glass concept needs a real backdrop blur; set it inline so
  // Lightning CSS (which strips backdrop-filter from stylesheets) can't drop it.
  const glass =
    id === "glass"
      ? { backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }
      : undefined;

  return (
    <div className={`lv lv-${id}`}>
      <button className="lv-card lv-card--create" style={glass} type="button">
        <span className="lv-icon">
          <HugeiconsIcon icon={AddTeamIcon} strokeWidth={1.8} />
        </span>
        <span className="lv-body">
          <span className="lv-kicker">Private league</span>
          <span className="lv-title">Create a league</span>
          <span className="lv-desc">
            Set one up and invite your friends to predict.
          </span>
        </span>
        <span className="lv-arrow" aria-hidden="true">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </span>
      </button>

      <button className="lv-card lv-card--join" style={glass} type="button">
        <span className="lv-icon">
          <HugeiconsIcon icon={Ticket01Icon} strokeWidth={1.8} />
        </span>
        <span className="lv-body">
          <span className="lv-kicker">Invite code</span>
          <span className="lv-title">Join a league</span>
          <span className="lv-desc">
            Got a code from a friend? Jump straight in.
          </span>
        </span>
        <span className="lv-arrow" aria-hidden="true">
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </span>
      </button>
    </div>
  );
}

// Concept 21 has bespoke, data-rich markup (barcode, fields, colour rail), so
// it lives outside the shared <Pair> skeleton. Adapted from a Uiverse airline
// ticket by Cobp.
function LiveTicket({
  kind,
  code,
  fields,
}: {
  kind: "create" | "join";
  code: string;
  fields: [string, string][];
}) {
  const create = kind === "create";
  return (
    <div className={`tkt-card tkt-card--${kind}`}>
      <article className={`tkt tkt--${kind}`}>
        <div className="tkt-barcode" aria-hidden="true" />
        <div className="tkt-sep" aria-hidden="true" />
        <div className="tkt-main">
          <div className="tkt-head">
            <div>
              <p className="tkt-kicker">
                {create ? "Private league" : "Invite code"}
              </p>
              <p className="tkt-title">
                {create ? "Create a league" : "Join a league"}
              </p>
            </div>
            <p className="tkt-code">{code}</p>
          </div>
          <div className="tkt-rule" />
          <div className="tkt-data">
            {fields.map(([t, s]) => (
              <div key={t}>
                <p className="tkt-t">{t}</p>
                <p className="tkt-s">{s}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="tkt-icons" aria-hidden="true">
          <HugeiconsIcon icon={create ? AddTeamIcon : Ticket01Icon} strokeWidth={1.8} />
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </div>
      </article>
    </div>
  );
}

export default function LeagueActionsDemoPage() {
  return (
    <div className="lv-page">
      <div className="lv-page-head">
        <h1>League Actions — 10 concepts</h1>
        <p>
          Ten complete design directions for the Create / Join league entry
          points. Same content and layout throughout; each explores a distinct
          visual language.
        </p>
      </div>

      <section className="lv-sec">
        <div className="lv-sec-head">
          <span className="lv-num">★</span>
          <div>
            <h2 className="lv-name">Home page (live)</h2>
            <p className="lv-concept">
              The cards currently shipping on the home page.
            </p>
          </div>
        </div>
        <HomeCards />
      </section>

      {VARIATIONS.map((v, i) => (
        <section className="lv-sec" key={v.id}>
          <div className="lv-sec-head">
            <span className="lv-num">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="lv-name">{v.name}</h2>
              <p className="lv-concept">{v.concept}</p>
            </div>
          </div>
          <Pair id={v.id} />
        </section>
      ))}

      <section className="lv-sec">
        <div className="lv-sec-head">
          <span className="lv-num">21</span>
          <div>
            <h2 className="lv-name">Live Ticket</h2>
            <p className="lv-concept">
              Detailed pass — barcode, data grid, colour rail, floating tilt and
              a light sweep (after a Uiverse concept by Cobp)
            </p>
          </div>
        </div>
        <div className="tkt-wrap">
          <LiveTicket
            kind="create"
            code="PG-NEW"
            fields={[
              ["Host", "You"],
              ["Format", "Knockout"],
              ["Members", "0/20"],
              ["Season", "2026"],
            ]}
          />
          <LiveTicket
            kind="join"
            code="PG-4F2K"
            fields={[
              ["Host", "A friend"],
              ["Format", "Knockout"],
              ["Spots", "4 left"],
              ["Season", "2026"],
            ]}
          />
        </div>
      </section>
    </div>
  );
}
