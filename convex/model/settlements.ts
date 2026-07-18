import type { QueryCtx } from "../_generated/server";

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
