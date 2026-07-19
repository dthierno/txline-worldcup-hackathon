import { v } from "convex/values";

import { mutation } from "./_generated/server";

// Upsert the caller's row on sign-in: stamp firstSeenAt the first time, bump
// lastSeenAt (and refresh the name) every time after. Keyed on Clerk identity,
// so each real person is one row - the point is just a unique-user count.
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
    const existing = await ctx.db
      .query("users")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastSeenAt: now, name: args.name });
    } else {
      await ctx.db.insert("users", {
        firstSeenAt: now,
        lastSeenAt: now,
        name: args.name,
        userId,
      });
    }

    return null;
  },
});
