import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";

// Pending connect tokens live 15 minutes; after that the deep link is dead and
// the fan has to tap Connect Telegram again.
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

async function requireUser(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("You must be signed in.");
  }

  return identity.subject;
}

// Mint a one-time connect token for the signed-in fan. The client drops it into
// the t.me/<bot>?start=<token> deep link; the webhook redeems it to bind this
// user to whichever Telegram chat opened the link. Any older pending token for
// the same user is cleared so only the latest link works.
export const createLinkToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);

    const prior = await ctx.db
      .query("telegramLinkTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const row of prior) {
      await ctx.db.delete(row._id);
    }

    const token = crypto.randomUUID().replace(/-/g, "");

    await ctx.db.insert("telegramLinkTokens", {
      createdAt: Date.now(),
      token,
      userId,
    });

    return token;
  },
});

// The caller's Telegram link, if any — drives the account menu label between
// "Connect Telegram" and "Telegram: @handle".
export const myTelegramLink = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ chatId: v.number(), username: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const row = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (!row) {
      return null;
    }

    return { chatId: row.chatId, username: row.username ?? null };
  },
});

// Disconnect the caller's Telegram chat.
export const unlink = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);

    const rows = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return null;
  },
});

// Redeem a connect token from the webhook: bind (userId -> chatId). A user has
// exactly one chat and a chat maps to exactly one user, so we clear any prior
// link on either side first. Returns the bound userId, or null if the token was
// unknown or expired (the token is consumed either way).
export const redeemLinkToken = internalMutation({
  args: {
    chatId: v.number(),
    token: v.string(),
    username: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.object({ userId: v.string() })),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!row) {
      return null;
    }

    const expired = Date.now() - row.createdAt > LINK_TOKEN_TTL_MS;
    await ctx.db.delete(row._id);

    if (expired) {
      return null;
    }

    const userId = row.userId;

    const priorForUser = await ctx.db
      .query("telegramLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const priorForChat = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    for (const prior of [...priorForUser, ...priorForChat]) {
      await ctx.db.delete(prior._id);
    }

    await ctx.db.insert("telegramLinks", {
      chatId: args.chatId,
      linkedAt: new Date().toISOString(),
      userId,
      username: args.username,
    });

    return { userId };
  },
});

// Low-level Telegram Bot API call. Actions and the http webhook both run in a
// runtime with fetch + process.env, so this plain helper is shared by both
// rather than hopping through an extra action. Throws on any non-2xx so callers
// surface the Telegram error message.
export async function telegramFetch(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set on this deployment.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram ${method} failed: ${response.status} ${text}`);
  }

  return response.json();
}

// Fire a plain Telegram DM. Exposed as an action so the future live-call
// scheduler (a mutation scheduling work) can reach the network through it.
export const sendMessage = internalAction({
  args: {
    chatId: v.number(),
    replyMarkup: v.optional(v.any()),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await telegramFetch("sendMessage", {
      chat_id: args.chatId,
      parse_mode: "HTML",
      reply_markup: args.replyMarkup,
      text: args.text,
    });

    return null;
  },
});

// Send a live-call prompt with Yes / No inline buttons. The callback_data
// encodes everything the webhook needs to record the tap:
// call:<fixtureId>:<callId>:<y|n> (kept short for Telegram's 64-byte limit).
export const sendCallPrompt = internalAction({
  args: {
    callId: v.string(),
    chatId: v.number(),
    fixtureId: v.number(),
    question: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await telegramFetch("sendMessage", {
      chat_id: args.chatId,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              callback_data: `call:${args.fixtureId}:${args.callId}:y`,
              text: "✅ Yes",
            },
            {
              callback_data: `call:${args.fixtureId}:${args.callId}:n`,
              text: "❌ No",
            },
          ],
        ],
      },
      text: args.question,
    });

    return null;
  },
});

// Record a live-call answer that came in as a Telegram button tap. Writes into
// the same goalCalls table the web app uses (keyed by userId + fixtureId, with
// answers keyed by callId), so a tap in Telegram and a tap in the app are one
// and the same. Returns null if this chat isn't linked to an account.
export const recordTelegramAnswer = internalMutation({
  args: {
    answer: v.string(),
    callId: v.string(),
    chatId: v.number(),
    fixtureId: v.number(),
  },
  returns: v.union(v.null(), v.object({ userId: v.string() })),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();

    if (!link) {
      return null;
    }

    const userId = link.userId;
    const entry = { answer: args.answer, answeredAt: new Date().toISOString() };

    const existing = await ctx.db
      .query("goalCalls")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", userId).eq("fixtureId", args.fixtureId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        answers: { ...existing.answers, [args.callId]: entry },
      });
    } else {
      await ctx.db.insert("goalCalls", {
        answers: { [args.callId]: entry },
        fixtureId: args.fixtureId,
        userId,
      });
    }

    return { userId };
  },
});
