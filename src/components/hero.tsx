"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";

const heroPanels = [
  <div className="hero-panel" key="predict">
    <div className="hero-row">
      <span className="hero-dot dot-red" />
      <span className="hero-step">2</span>
      <span className="hero-vs">-</span>
      <span className="hero-step">0</span>
      <span className="hero-dot dot-blue" />
    </div>
    <div className="hero-row">
      <span className="hero-dot dot-green" />
      <span className="hero-step">1</span>
      <span className="hero-vs">-</span>
      <span className="hero-step">3</span>
      <span className="hero-dot dot-gold" />
    </div>
    <div className="hero-pills">
      <span /><span /><span />
    </div>
  </div>,
  <div className="hero-panel" key="league">
    <div className="hero-rank">
      <b>1</b>
      <span className="hero-bar" style={{ width: "58%" }} />
      <span className="hero-mini" />
      <span className="hero-mini" />
    </div>
    <div className="hero-rank">
      <b>2</b>
      <span className="hero-bar" style={{ width: "44%" }} />
      <span className="hero-mini" />
      <span className="hero-mini" />
    </div>
    <div className="hero-rank">
      <b>3</b>
      <span className="hero-bar" style={{ width: "36%" }} />
      <span className="hero-mini" />
      <span className="hero-mini" />
    </div>
  </div>,
  <div className="hero-panel" key="verify">
    <div className="hero-rank">
      <i className="hero-check">✓</i>
      <span className="hero-bar" style={{ width: "62%" }} />
    </div>
    <div className="hero-rank">
      <i className="hero-check">✓</i>
      <span className="hero-bar" style={{ width: "48%" }} />
    </div>
    <p className="hero-proof">Settled &amp; verified by TxLINE</p>
  </div>,
];

function HeroCard() {
  const [panel, setPanel] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setPanel((current) => (current + 1) % heroPanels.length),
      3500,
    );

    return () => clearInterval(timer);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="hero-card" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={panel}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -120 }}
            initial={{ opacity: 0, x: 120 }}
            transition={{ damping: 28, stiffness: 260, type: "spring" }}
          >
            {heroPanels[panel]}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

export function Hero({ variant = "pat-4" }: { variant?: string }) {
  return (
    <div className={`hero-box ${variant}`}>
      <div className="hero-stripes hero-stripes-l" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="hero-stripes hero-stripes-r" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="hero">
        <h1 className="sr-only">Fan Forecast</h1>
        <div className="wc-strip">
          <span className="wc-badge">26</span>
          <span className="wc-text">World Cup 2026</span>
          <span className="wc-hosts">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="United States" src="https://flagcdn.com/w40/us.png" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Canada" src="https://flagcdn.com/w40/ca.png" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Mexico" src="https://flagcdn.com/w40/mx.png" />
          </span>
        </div>
        <p className="hero-title">
          <span className="hero-word">Predict.</span>{" "}
          <span className="hero-word hero-fill">Play.</span>{" "}
          <span className="hero-word">Verify.</span>
        </p>
        <p className="text-muted-foreground">
          Guess results, compete with friends - every score verified by TxLINE.
        </p>
        <HeroCard />
        {[
          ["fr", "hero-float-1"],
          ["es", "hero-float-2"],
          ["ar", "hero-float-3"],
          ["gb-eng", "hero-float-4"],
          ["no", "hero-float-5"],
        ].map(([iso, cls]) => (
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
