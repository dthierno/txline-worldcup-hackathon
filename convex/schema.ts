import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Private prediction leagues plus per-user gameplay, now real and cross-device.
// Everything a player builds up — their picks, their settled scores, their
// live-call answers — lives here keyed by Clerk identity (identity.subject),
// so a fresh device rehydrates on sign-in instead of trusting localStorage.
export default defineSchema({
  // One row per Clerk user, upserted on sign-in. Not used for auth (Clerk owns
  // identity) - it's just so the unique-user count is visible at a glance.
  users: defineTable({
    userId: v.string(),
    name: v.string(),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  }).index("by_user", ["userId"]),

  leagues: defineTable({
    name: v.string(),
    // Invite code (PG-XXXX); the thing friends share to join.
    code: v.string(),
    // Clerk user id (identity.subject) of the creator / manager.
    ownerId: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  members: defineTable({
    leagueId: v.id("leagues"),
    userId: v.string(),
    // Display name from Clerk, kept fresh on each sync.
    name: v.string(),
    // The member's total earned points. No longer pushed from the device —
    // now re-derived server-side from `settlements` (see model/settlements.ts)
    // whenever a settlement lands, so the leaderboard stays a cheap read.
    points: v.number(),
    joinedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_user", ["leagueId", "userId"])
    .index("by_user", ["userId"]),

  // One row per (userId, fixtureId): the player's saved pick for a match.
  // `prediction` is an opaque client blob (a rich MatchPrediction object with
  // many optional/nested fields); the backend never inspects it, so v.any().
  predictions: defineTable({
    userId: v.string(),
    fixtureId: v.number(),
    prediction: v.any(),
    savedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_fixture", ["userId", "fixtureId"]),

  // One row per (userId, fixtureId): the settled result of a match. This is the
  // source of truth for a player's points — summed into `members.points`.
  settlements: defineTable({
    userId: v.string(),
    fixtureId: v.number(),
    finalScore: v.string(),
    totalPoints: v.number(),
    botCallPoints: v.optional(v.record(v.string(), v.number())),
    settledAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_fixture", ["userId", "fixtureId"]),

  // One row per (userId, fixtureId): that match's live-call answers, keyed by
  // call id to the answer the player gave and when.
  goalCalls: defineTable({
    userId: v.string(),
    fixtureId: v.number(),
    answers: v.record(
      v.string(),
      v.object({ answer: v.string(), answeredAt: v.string() }),
    ),
  })
    .index("by_user_fixture", ["userId", "fixtureId"])
    .index("by_user", ["userId"]),
});
