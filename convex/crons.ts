import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Sweep every watched fixture once a minute: open a goal-window call when one is
// live, resolve the previous window, and DM linked fans. Runs server-side, so
// it fires during real matches whether or not anyone has the app open.
crons.interval(
  "poll live matches",
  { minutes: 1 },
  internal.liveBot.pollLiveMatches,
  {},
);

export default crons;
