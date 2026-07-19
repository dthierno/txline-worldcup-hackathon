"use client";

import { useUser } from "@clerk/nextjs";

// The signed-in fan's public handle for every board (global, league) and their
// profile. Usernames are mandatory in Clerk now, so we show the username and
// never the real name — two people called "Alex" stay distinct, and nobody's
// legal name leaks onto a leaderboard. Falls back to the email local-part only
// if a username somehow isn't set yet, then a neutral label as a last resort.
export function useDisplayName(): string {
  const { user } = useUser();

  return (
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Player"
  );
}
