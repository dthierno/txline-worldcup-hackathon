import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { userSettledTotal } from "./model/settlements";

async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("You must be signed in.");
  }

  return identity.subject;
}

// Upsert the caller's pick for one fixture. The prediction is an opaque blob;
// we only fish out its own `savedAt` timestamp (if it carried one) so the row's
// savedAt tracks the client's clock, falling back to now.
export const savePrediction = mutation({
  args: { fixtureId: v.number(), prediction: v.any() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const blob = args.prediction as { savedAt?: unknown } | null;
    const savedAt =
      blob && typeof blob.savedAt === "string"
        ? blob.savedAt
        : new Date().toISOString();

    const existing = await ctx.db
      .query("predictions")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", userId).eq("fixtureId", args.fixtureId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        prediction: args.prediction,
        savedAt,
      });
    } else {
      await ctx.db.insert("predictions", {
        fixtureId: args.fixtureId,
        prediction: args.prediction,
        savedAt,
        userId,
      });
    }

    return null;
  },
});

// Upsert the caller's settled result for one fixture, then re-derive their total
// from every settlement they own and push it onto each of their league boards.
// This is what replaced the device pushing points up: standings are now the sum
// of server-held settlements, not a number the client asserts.
export const saveSettlement = mutation({
  args: {
    fixtureId: v.number(),
    finalScore: v.string(),
    totalPoints: v.number(),
    botCallPoints: v.optional(v.record(v.string(), v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const settledAt = new Date().toISOString();

    const existing = await ctx.db
      .query("settlements")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", userId).eq("fixtureId", args.fixtureId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        botCallPoints: args.botCallPoints,
        finalScore: args.finalScore,
        settledAt,
        totalPoints: args.totalPoints,
      });
    } else {
      await ctx.db.insert("settlements", {
        botCallPoints: args.botCallPoints,
        finalScore: args.finalScore,
        fixtureId: args.fixtureId,
        settledAt,
        totalPoints: args.totalPoints,
        userId,
      });
    }

    // Re-derive the caller's standing and refresh every board they're on.
    const total = await userSettledTotal(ctx, userId);

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const membership of memberships) {
      if (membership.points !== total) {
        await ctx.db.patch(membership._id, { points: total });
      }
    }

    // Keep the caller's global-board row current too.
    const userRow = await ctx.db
      .query("users")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (userRow && userRow.points !== total) {
      await ctx.db.patch(userRow._id, { points: total });
    }

    return null;
  },
});

// Upsert the caller's live-call answers for one fixture, replacing the whole
// answers map with whatever the client sends.
export const saveGoalCalls = mutation({
  args: {
    fixtureId: v.number(),
    answers: v.record(
      v.string(),
      v.object({ answer: v.string(), answeredAt: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const existing = await ctx.db
      .query("goalCalls")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", userId).eq("fixtureId", args.fixtureId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { answers: args.answers });
    } else {
      await ctx.db.insert("goalCalls", {
        answers: args.answers,
        fixtureId: args.fixtureId,
        userId,
      });
    }

    return null;
  },
});

// Another player's picks, for their profile page. Visible only to the player
// themselves or to someone who shares a league with them; returns null when the
// viewer isn't allowed (or isn't signed in). The client keeps unplayed matches
// hidden until kickoff.
export const userPredictions = query({
  args: { userId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      points: v.number(),
      predictions: v.array(
        v.object({
          fixtureId: v.number(),
          prediction: v.any(),
          savedAt: v.string(),
        }),
      ),
      settlements: v.array(
        v.object({
          fixtureId: v.number(),
          finalScore: v.string(),
          settledAt: v.string(),
          totalPoints: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const me = identity.subject;
    const target = args.userId;

    const targetMembers = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .collect();

    if (me !== target) {
      const myLeagueIds = new Set(
        (
          await ctx.db
            .query("members")
            .withIndex("by_user", (q) => q.eq("userId", me))
            .collect()
        ).map((membership) => String(membership.leagueId)),
      );
      const sharesLeague = targetMembers.some((membership) =>
        myLeagueIds.has(String(membership.leagueId)),
      );

      if (!sharesLeague) {
        return null;
      }
    }

    const predictions = await ctx.db
      .query("predictions")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .collect();
    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .collect();

    return {
      name: targetMembers[0]?.name ?? "Player",
      points: settlements.reduce((sum, row) => sum + row.totalPoints, 0),
      predictions: predictions.map((row) => ({
        fixtureId: row.fixtureId,
        prediction: row.prediction,
        savedAt: row.savedAt,
      })),
      settlements: settlements.map((row) => ({
        fixtureId: row.fixtureId,
        finalScore: row.finalScore,
        settledAt: row.settledAt,
        totalPoints: row.totalPoints,
      })),
    };
  },
});

// Everything the signed-in player has across the three gameplay tables, used to
// hydrate a fresh device on sign-in. Not signed in -> empty arrays, never throws.
export const myGameState = query({
  args: {},
  returns: v.object({
    predictions: v.array(
      v.object({
        fixtureId: v.number(),
        prediction: v.any(),
        savedAt: v.string(),
      }),
    ),
    settlements: v.array(
      v.object({
        fixtureId: v.number(),
        finalScore: v.string(),
        totalPoints: v.number(),
        botCallPoints: v.optional(v.record(v.string(), v.number())),
        settledAt: v.string(),
      }),
    ),
    goalCalls: v.array(
      v.object({
        fixtureId: v.number(),
        answers: v.record(
          v.string(),
          v.object({ answer: v.string(), answeredAt: v.string() }),
        ),
      }),
    ),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return { goalCalls: [], predictions: [], settlements: [] };
    }

    const userId = identity.subject;

    const predictions = await ctx.db
      .query("predictions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const goalCalls = await ctx.db
      .query("goalCalls")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      goalCalls: goalCalls.map((row) => ({
        answers: row.answers,
        fixtureId: row.fixtureId,
      })),
      predictions: predictions.map((row) => ({
        fixtureId: row.fixtureId,
        prediction: row.prediction,
        savedAt: row.savedAt,
      })),
      settlements: settlements.map((row) => ({
        botCallPoints: row.botCallPoints,
        finalScore: row.finalScore,
        fixtureId: row.fixtureId,
        settledAt: row.settledAt,
        totalPoints: row.totalPoints,
      })),
    };
  },
});
