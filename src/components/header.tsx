"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { loadSettlements } from "@/lib/prediction-store";

// The PredGame mark: the intro widget's rounded-hexagon style (teal-to-blue
// gradient with the lighter sheen) but with our own glyph - a bold black
// check, the called-it-right stamp the whole game is about.
function PredGameMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="18 25 30 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M29.9206 27.1713C31.8261 26.0542 34.1736 26.0542 36.079 27.1713L43.254 31.3778C45.1594 32.4949 46.3332 34.5594 46.3332 36.7937V45.2067C46.3332 47.4409 45.1594 49.5054 43.254 50.6225L36.079 54.829C34.1736 55.9461 31.8261 55.9461 29.9206 54.829L22.7457 50.6225C20.8403 49.5054 19.6665 47.4409 19.6665 45.2067V36.7937C19.6665 34.5594 20.8403 32.4949 22.7457 31.3778L29.9206 27.1713Z"
        fill="url(#hd_mark_a)"
      />
      <path
        d="M29.9204 27.1713C31.8258 26.0542 34.1738 26.0542 36.0793 27.1713L39.0063 28.8862L25.8293 51.6752C25.7184 51.8665 25.6214 52.0609 25.5337 52.256L22.7459 50.6218C20.8405 49.5047 19.6665 47.4407 19.6665 45.2065V36.7937C19.6665 34.5595 20.8405 32.4942 22.7459 31.3771L29.9204 27.1713Z"
        fill="url(#hd_mark_b)"
      />
      <path
        d="M26.5 42.1 L31.4 46.9 L39.7 34.9"
        stroke="black"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="hd_mark_a"
          x1="25.5486"
          y1="66.3335"
          x2="49.8078"
          y2="27.7977"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.39" stopColor="#5FFF94" />
          <stop offset="1" stopColor="#136AFF" />
        </linearGradient>
        <linearGradient
          id="hd_mark_b"
          x1="67.6665"
          y1="-20.4128"
          x2="33.4144"
          y2="55.8148"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.39" stopColor="#5FFF94" />
          <stop offset="1" stopColor="#136AFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

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
          <PredGameMark size={30} />
          <span className="app-logo-word">
            Pred<span>Game</span>
          </span>
        </Link>
        <div className="app-account">
          {points !== null ? (
            <span className="app-user-pts" aria-label={`${points} points`}>
              <span aria-hidden className="app-user-hex" />
              <strong>{points}</strong> pts
            </span>
          ) : null}
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="app-signin" type="button" aria-label="Sign in">
                <AccountGlyph size={34} />
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton
              appearance={{
                elements: { userButtonAvatarBox: "app-clerk-avatar" },
              }}
            />
          </Show>
        </div>
      </div>
    </header>
  );
}
