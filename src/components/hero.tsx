"use client";

import { useEffect, useRef } from "react";

import { PredictWidget } from "@/components/predict-widget";

// Country pills clustered in the lower gutters flanking the widget (positioned
// by the .hero-predict .hero-float-* rules in globals.css).
const FLAGS: [string, string][] = [
  ["fr", "hero-float-1"],
  ["es", "hero-float-2"],
  ["gb-eng", "hero-float-4"],
  ["no", "hero-float-5"],
  ["br", "hero-float-6"],
  ["de", "hero-float-7"],
  ["pt", "hero-float-8"],
  ["ar", "hero-float-9"],
  ["nl", "hero-float-10"],
  ["jp", "hero-float-11"],
  ["be", "hero-float-12"],
  ["hr", "hero-float-13"],
  ["uy", "hero-float-14"],
  ["mx", "hero-float-15"],
];

// Widget panel matching each phase: 0 Predict (score), 1 Play (rows), 2 Prevail.
const PANELS = ["pw-panel-a", "pw-panel-c", "pw-panel-b"];

export function Hero({ variant = "pat-4" }: { variant?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // One imperative clock drives BOTH the title highlight and the widget panel,
  // so they can never drift. We mutate the DOM directly (no React state) so the
  // component never re-renders — that keeps the injected widget HTML stable.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const words = [
      ...root.querySelectorAll<HTMLElement>(".hero-title .hero-word"),
    ];
    let phase = 0;

    const apply = () => {
      words.forEach((word, i) => {
        word.style.color = i === phase ? "var(--won)" : "";
      });
      PANELS.forEach((cls, i) => {
        const el = root.querySelector<HTMLElement>(`.${cls}`);
        if (!el) return;
        const active = i === phase;
        el.style.opacity = active ? "1" : "0";
        el.style.transform = active ? "translateX(0)" : "translateX(24px)";
      });
    };

    apply();
    const id = setInterval(() => {
      phase = (phase + 1) % PANELS.length;
      apply();
    }, 3000);

    return () => clearInterval(id);
  }, []);

  return (
    <div className={`hero-box hero-predict ${variant}`} ref={rootRef}>
      <div className="hero-stripes hero-stripes-l" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="hero-stripes hero-stripes-r" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="hero">
        <h1 className="sr-only">PredPick</h1>
        <div className="hero-copy">
          <p className="hero-title">
            {/* Predict starts highlighted (phase 0) for SSR; the effect above
                takes over the cycle once mounted. */}
            <span className="hero-word" style={{ color: "var(--won)" }}>
              Predict.
            </span>
            <span className="hero-word">Play.</span>
            <span className="hero-word">Prevail.</span>
          </p>
          <p className="text-muted-foreground">
            Guess results and compete against friends
          </p>
        </div>
        <div className="hero-visual">
          <PredictWidget />
        </div>
        {FLAGS.map(([iso, cls]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            aria-hidden="true"
            className={`hero-float ${cls}`}
            key={iso}
            loading="lazy"
            src={`https://flagcdn.com/w80/${iso}.png`}
          />
        ))}
      </div>
    </div>
  );
}
