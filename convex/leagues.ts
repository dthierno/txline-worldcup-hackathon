import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { userSettledTotal } from "./model/settlements";

// Unambiguous characters only (no O/0, I/1).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "PG-";

  for (let index = 0; index < 4; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return code;
}

async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("You must be signed in.");
  }

  return identity.subject;
}

// Create a league: mint a unique invite code, own it, seed the creator's own
// board row with the points they've settled server-side so far.
export const createLeague = mutation({
  args: { name: v.string(), displayName: v.string() },
  returns: v.object({ leagueId: v.id("leagues"), code: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    let code = generateCode();

    while (
      await ctx.db
        .query("leagues")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first()
    ) {
      code = generateCode();
    }

    const now = Date.now();
    const points = await userSettledTotal(ctx, userId);
    const leagueId = await ctx.db.insert("leagues", {
      code,
      createdAt: now,
      name: args.name.trim() || "New league",
      ownerId: userId,
    });

    await ctx.db.insert("members", {
      joinedAt: now,
      leagueId,
      name: args.displayName,
      points,
      userId,
    });

    return { code, leagueId };
  },
});

// Join by invite code. Returns the league id, or null if no such code (the
// client shows "not found"). Idempotent: re-joining just refreshes your row.
export const joinLeague = mutation({
  args: { code: v.string(), displayName: v.string() },
  returns: v.union(v.id("leagues"), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const code = args.code.trim().toUpperCase();
    const league = await ctx.db
      .query("leagues")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!league) {
      return null;
    }

    const points = await userSettledTotal(ctx, userId);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", league._id).eq("userId", userId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.displayName,
        points,
      });
    } else {
      await ctx.db.insert("members", {
        joinedAt: Date.now(),
        leagueId: league._id,
        name: args.displayName,
        points,
        userId,
      });
    }

    return league._id;
  },
});

// The leagues the signed-in user belongs to, with their role.
export const myLeagues = query({
  args: {},
  returns: v.array(
    v.object({
      code: v.string(),
      id: v.id("leagues"),
      name: v.string(),
      role: v.union(v.literal("owner"), v.literal("member")),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return [];
    }

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    const leagues: Array<{
      code: string;
      id: (typeof memberships)[number]["leagueId"];
      joinedAt: number;
      name: string;
      role: "member" | "owner";
    }> = [];

    for (const membership of memberships) {
      const league = await ctx.db.get(membership.leagueId);

      if (league) {
        leagues.push({
          code: league.code,
          id: league._id,
          joinedAt: membership.joinedAt,
          name: league.name,
          role: league.ownerId === identity.subject ? "owner" : "member",
        });
      }
    }

    // Oldest first, matching how they were joined.
    leagues.sort((left, right) => left.joinedAt - right.joinedAt);

    return leagues.map(({ joinedAt: _joinedAt, ...league }) => league);
  },
});

// Live standings for one league, highest first, flagging the caller's row.
export const leaderboard = query({
  args: { leagueId: v.id("leagues") },
  returns: v.array(
    v.object({
      isMe: v.boolean(),
      name: v.string(),
      points: v.number(),
      userId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const me = identity?.subject ?? null;
    const members = await ctx.db
      .query("members")
      .withIndex("by_league", (q) => q.eq("leagueId", args.leagueId))
      .collect();

    return members
      .map((member) => ({
        isMe: member.userId === me,
        name: member.name,
        points: member.points,
        userId: member.userId,
      }))
      .sort((left, right) => right.points - left.points);
  },
});

// Refresh the caller's display name on every board they're on. Points are no
// longer pushed from the device — they're server-derived from settlements — so
// this only ever touches the name.
export const syncProfile = mutation({
  args: { displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    for (const membership of memberships) {
      if (membership.name !== args.displayName) {
        await ctx.db.patch(membership._id, {
          name: args.displayName,
        });
      }
    }

    return null;
  },
});

// Owner-only: drop a member from the board. The owner can't remove themselves.
export const removeMember = mutation({
  args: { leagueId: v.id("leagues"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const league = await ctx.db.get(args.leagueId);

    if (!league) {
      throw new Error("League not found.");
    }

    if (league.ownerId !== userId) {
      throw new Error("Only the league manager can remove members.");
    }

    if (args.userId === league.ownerId) {
      throw new Error("The manager can't be removed.");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", args.leagueId).eq("userId", args.userId),
      )
      .first();

    if (member) {
      await ctx.db.delete(member._id);
    }

    return null;
  },
});
