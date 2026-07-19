import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { userSettledTotal } from "./model/settlements";

// Upsert the caller's row on sign-in: stamp firstSeenAt the first time, bump
// lastSeenAt (and refresh the name + settled points) every time after. Keyed on
// Clerk identity, so each real person is one row.
export const recordUser = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const userId = identity.subject;
    const now = new Date().toISOString();
    const points = await userSettledTotal(ctx, userId);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        name: args.name,
        points,
      });
    } else {
      await ctx.db.insert("users", {
        firstSeenAt: now,
        lastSeenAt: now,
        name: args.name,
        points,
        userId,
      });
    }

    return null;
  },
});

// The global board: the top players across everyone who's signed up, highest
// points first, flagging the caller's row. Public - viewable signed out too.
export const globalLeaderboard = query({
  args: {},
  returns: v.array(
    v.object({
      isMe: v.boolean(),
      name: v.string(),
      points: v.number(),
      userId: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const me = identity?.subject ?? null;
    const users = await ctx.db
      .query("users")
      .withIndex("by_points")
      .order("desc")
      .take(100);

    return users.map((user) => ({
      isMe: user.userId === me,
      name: user.name,
      points: user.points ?? 0,
      userId: user.userId,
    }));
  },
});
