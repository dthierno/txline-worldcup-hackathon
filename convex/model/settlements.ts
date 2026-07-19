import type { MutationCtx, QueryCtx } from "../_generated/server";

// +2 for a correct bot live call, mirroring GOAL_CALL_POINTS in the web app.
const LIVE_CALL_POINTS = 2;

// The server-side source of truth for a player's standing: the sum of every
// fixture they've settled. League board rows read this so points can never be
// spoofed from a device — they're always re-derived from settlements here.
//
// Bounded scan: one settlement row per fixture the user has played, queried
// through the by_user index (never a full table scan).
export async function userSettledTotal(
  ctx: QueryCtx,
  userId: string,
): Promise<number> {
  const settlements = await ctx.db
    .query("settlements")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return settlements.reduce(
    (total, settlement) => total + settlement.totalPoints,
    0,
  );
}

// Points from bot live calls (answered in Telegram or on the web): +2 for each
// resolved call the fan called correctly. Demo calls have no liveCalls row, so
// they're naturally excluded. Bounded by the fan's own answers (by_user_call
// prefix) plus one indexed lookup per answer.
export async function userLiveCallPoints(
  ctx: QueryCtx,
  userId: string,
): Promise<number> {
  const answers = await ctx.db
    .query("liveCallAnswers")
    .withIndex("by_user_call", (q) => q.eq("userId", userId))
    .collect();

  let points = 0;

  for (const answer of answers) {
    const call = await ctx.db
      .query("liveCalls")
      .withIndex("by_callId", (q) => q.eq("callId", answer.callId))
      .first();

    if (
      call &&
      call.status === "resolved" &&
      call.correctAnswer &&
      answer.answer === call.correctAnswer
    ) {
      points += LIVE_CALL_POINTS;
    }
  }

  return points;
}

// A player's whole standing: settled fixtures + graded live calls. This is what
// every leaderboard total should reflect.
export async function userTotalPoints(
  ctx: QueryCtx,
  userId: string,
): Promise<number> {
  const settled = await userSettledTotal(ctx, userId);
  const live = await userLiveCallPoints(ctx, userId);

  return settled + live;
}

// Re-derive a player's total and push it onto their users row + every league
// board they're on. Called whenever a settlement lands or a live call resolves,
// so the standings stay a cheap read.
export async function refreshUserPoints(
  ctx: MutationCtx,
  userId: string,
): Promise<void> {
  const total = await userTotalPoints(ctx, userId);

  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const membership of memberships) {
    if (membership.points !== total) {
      await ctx.db.patch(membership._id, { points: total });
    }
  }

  const userRow = await ctx.db
    .query("users")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (userRow && userRow.points !== total) {
    await ctx.db.patch(userRow._id, { points: total });
  }
}
