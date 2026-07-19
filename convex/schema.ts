import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Private prediction leagues plus per-user gameplay, now real and cross-device.
// Everything a player builds up — their picks, their settled scores, their
// live-call answers — lives here keyed by Clerk identity (identity.subject),
// so a fresh device rehydrates on sign-in instead of trusting localStorage.
export default defineSchema({
  // One row per Clerk user, upserted on sign-in. Not used for auth (Clerk owns
  // identity). `points` mirrors the user's settled total (like members.points)
  // so the global board is a real cross-user leaderboard; by_points serves it.
  users: defineTable({
    userId: v.string(),
    // The user's Clerk username (mandatory), refreshed on each sign-in.
    name: v.string(),
    // Server-derived settled total; optional only to keep pre-existing rows
    // (written before this field) valid until their next sign-in refreshes it.
    points: v.optional(v.number()),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_points", ["points"]),

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
    // The member's Clerk username (mandatory now), kept fresh on each sync.
    // Never their real name — boards show handles so identities stay distinct.
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

  // Links a Clerk user to their private Telegram chat so the bot can DM live
  // calls to them and score their taps into the same gameplay tables. chatId is
  // Telegram's numeric chat id for the 1:1 chat (equals the user's Telegram id).
  telegramLinks: defineTable({
    userId: v.string(),
    chatId: v.number(),
    // Telegram @username at link time, just for display ("Connected as @x").
    username: v.optional(v.string()),
    linkedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"]),

  // Short-lived, single-use tokens for the connect flow: the app mints one tied
  // to the signed-in user, hands it to Telegram via the t.me/<bot>?start=<token>
  // deep link, and the webhook redeems it to bind chatId -> userId, then deletes
  // it. createdAt lets us expire stale tokens.
  telegramLinkTokens: defineTable({
    token: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),
});
