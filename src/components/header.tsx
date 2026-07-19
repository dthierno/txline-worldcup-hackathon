"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/../convex/_generated/api";
import {
  GAMESTATE_HYDRATED_EVENT,
  LIVE_STANDING_CHANGED_EVENT,
  loadSettlements,
  readLiveStanding,
  SETTLEMENTS_CHANGED_EVENT,
} from "@/lib/prediction-store";

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

// Telegram paper-plane, for the account-menu connect action.
function TelegramGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="16"
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21.94 4.63a1.3 1.3 0 0 0-1.35-.2L3.3 11.2c-.86.34-.84 1.57.03 1.88l4.2 1.5 1.63 5.02a1 1 0 0 0 1.67.4l2.28-2.2 4.3 3.16a1.3 1.3 0 0 0 2.03-.8l2.9-14.2a1.3 1.3 0 0 0-.4-1.33ZM9.7 14.13l7.6-6.06-9.03 5.35Z" />
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
  // The match leaderboard publishes your live standing (settled + this match's
  // in-play points) while you're watching a game; the pill mirrors it so it
  // agrees with the leaderboard instead of showing only settled points.
  const [liveStanding, setLiveStanding] = useState<number | null>(null);
  // The fan's Telegram link (null until connected) toggles the menu label.
  const telegramLink = useQuery(api.telegram.myTelegramLink);
  const createLinkToken = useMutation(api.telegram.createLinkToken);

  // Connect: mint a one-time token and hand it to the bot via a deep link, so
  // Telegram's /start carries it back to our webhook. Already linked: just open
  // the chat. Needs the bot's @username at build time.
  const openTelegram = async () => {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

    if (!botUsername) {
      console.warn("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not set.");

      return;
    }

    if (telegramLink) {
      window.open(`https://t.me/${botUsername}`, "_blank", "noopener");

      return;
    }

    const token = await createLinkToken({});
    window.open(
      `https://t.me/${botUsername}?start=${token}`,
      "_blank",
      "noopener",
    );
  };

  useEffect(() => {
    // Re-read the settled total on every change: a fresh settle, the sign-in
    // hydration that pulls the server copy onto this device, or another tab.
    // Deferred once past the first paint so the SSR "0" doesn't mismatch.
    const refresh = () => {
      setPoints(
        Object.values(loadSettlements()).reduce(
          (sum, entry) => sum + (entry.totalPoints ?? 0),
          0,
        ),
      );
    };
    const timer = setTimeout(refresh, 0);

    window.addEventListener(SETTLEMENTS_CHANGED_EVENT, refresh);
    window.addEventListener(GAMESTATE_HYDRATED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(SETTLEMENTS_CHANGED_EVENT, refresh);
      window.removeEventListener(GAMESTATE_HYDRATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setLiveStanding(readLiveStanding());

    refresh();
    window.addEventListener(LIVE_STANDING_CHANGED_EVENT, refresh);

    return () =>
      window.removeEventListener(LIVE_STANDING_CHANGED_EVENT, refresh);
  }, []);

  // While watching a live match the pill shows the leaderboard-matching live
  // total; elsewhere it falls back to the settled sum.
  const displayPoints = liveStanding ?? points;

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
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="app-signin" type="button" aria-label="Sign in">
                <AccountGlyph size={34} />
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            {/* Unified chip: points capsule + the real Clerk account menu.
                Points default to 0 until this device settles a match. */}
            <div className="app-user">
              <span
                className="app-user-pts"
                aria-label={`${displayPoints ?? 0} points`}
              >
                <span aria-hidden className="app-user-hex" />
                <strong>{displayPoints ?? 0}</strong> pts
              </span>
              <UserButton
                appearance={{
                  elements: { userButtonAvatarBox: "app-clerk-avatar" },
                }}
              >
                <UserButton.MenuItems>
                  <UserButton.Action
                    label={
                      telegramLink
                        ? telegramLink.username
                          ? `Telegram: @${telegramLink.username}`
                          : "Telegram connected"
                        : "Connect Telegram"
                    }
                    labelIcon={<TelegramGlyph />}
                    onClick={openTelegram}
                  />
                </UserButton.MenuItems>
              </UserButton>
            </div>
          </Show>
        </div>
      </div>
    </header>
  );
}
