import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Private prediction leagues, now real and cross-device. A league is owned by
// the Clerk user who created it; members carry the points synced from their
// own device so everyone on the board sees the same live standings.
export default defineSchema({
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
    // The member's total earned points, pushed from their device.
    points: v.number(),
    joinedAt: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_user", ["leagueId", "userId"])
    .index("by_user", ["userId"]),
});
