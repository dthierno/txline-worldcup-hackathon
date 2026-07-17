"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadSettlements } from "@/lib/prediction-store";

// The generic account glyph (same person-in-circle path the intro widget's
// mock header uses).
function AccountGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 2.66675C23.3638 2.66675 29.3333 8.63628 29.3333 16.0001C29.3333 23.3639 23.3638 29.3334 16 29.3334C8.63616 29.3334 2.66663 23.3639 2.66663 16.0001C2.66663 8.63628 8.63616 2.66675 16 2.66675ZM16 17.3334C13.0544 17.3334 10.6666 18.5273 10.6666 20.0001C10.6666 21.4729 10.6666 22.6667 16 22.6667C21.3333 22.6667 21.3333 21.4729 21.3333 20.0001C21.3333 18.5273 18.9454 17.3334 16 17.3334ZM16 9.33342C14.5272 9.33342 13.3333 10.5273 13.3333 12.0001C13.3333 13.4729 14.5272 14.6667 16 14.6667C17.4728 14.6667 18.6666 13.4729 18.6666 12.0001C18.6666 10.5273 17.4728 9.33342 16 9.33342Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Sticky top header (structure from FotMob's Predict header; PredGame wordmark
// and a generic account icon in place of their branded assets). Once the fan
// has settled points on this device the icon grows into the intro widget's
// signed-in chip: hex token, points, avatar.
export function Header() {
  // null = signed-out presentation (also the SSR state).
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    const settlements = Object.values(loadSettlements());

    if (settlements.length === 0) {
      return;
    }

    const total = settlements.reduce(
      (sum, entry) => sum + entry.totalPoints,
      0,
    );
    const timer = setTimeout(() => setPoints(total), 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-logo" href="/" aria-label="PredGame home">
          Pred<span>Game</span>
        </Link>
        {points === null ? (
          <button className="app-signin" type="button" aria-label="Sign in">
            <AccountGlyph size={36} />
          </button>
        ) : (
          <button
            className="app-user"
            type="button"
            aria-label={`Signed in - ${points} points`}
          >
            <span className="app-user-pts">
              <span aria-hidden className="app-user-hex" />
              <strong>{points}</strong> pts
            </span>
            <span className="app-user-avatar">
              <AccountGlyph size={22} />
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
