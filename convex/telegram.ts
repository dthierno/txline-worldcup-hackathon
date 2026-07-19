import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
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

// Upsert one bot-live-call answer (from a Telegram tap or the web), keyed by
// (userId, callId) so re-answering overwrites. Shared by the webhook handler
// and the web answerLiveCall mutation, so both surfaces write the same row.
export async function upsertLiveCallAnswer(
  ctx: MutationCtx,
  args: { answer: string; callId: string; fixtureId: number; userId: string },
): Promise<void> {
  const existing = await ctx.db
    .query("liveCallAnswers")
    .withIndex("by_user_call", (q) =>
      q.eq("userId", args.userId).eq("callId", args.callId),
    )
    .first();
  const answeredAt = new Date().toISOString();

  if (existing) {
    await ctx.db.patch(existing._id, { answer: args.answer, answeredAt });
  } else {
    await ctx.db.insert("liveCallAnswers", {
      answer: args.answer,
      answeredAt,
      callId: args.callId,
      fixtureId: args.fixtureId,
      userId: args.userId,
    });
  }
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

    await upsertLiveCallAnswer(ctx, {
      answer: args.answer,
      callId: args.callId,
      fixtureId: args.fixtureId,
      userId,
    });

    return { userId };
  },
});

// --- /demo replay ----------------------------------------------------------
// A scripted mini-match played out over DM so anyone can feel the live-call
// loop on demand, no real match required. Taps land in goalCalls under an
// isolated fake fixture id, so a demo never mixes with real gameplay.
const DEMO_FIXTURE_ID = 990000001;
const DEMO_END_MS = 37_000;

type DemoCall = {
  callId: string;
  correct: "no" | "yes";
  points: number;
  promptAtMs: number;
  question: string;
  resolveAtMs: number;
  result: string;
};

const DEMO_CALLS: DemoCall[] = [
  {
    callId: "d1",
    correct: "yes",
    points: 10,
    promptAtMs: 1_500,
    question: "⚽️ 22' — Brazil 0–0 France\n\nWill Brazil score in the next 10 minutes?",
    resolveAtMs: 8_000,
    result: "🟢 <b>GOAL — Vinícius Jr, 27'!</b> Brazil 1–0 — yes, they scored.",
  },
  {
    callId: "d2",
    correct: "no",
    points: 8,
    promptAtMs: 11_000,
    question: "🚩 38' — Corner to France.\n\nWill it lead to a shot on target?",
    resolveAtMs: 17_000,
    result: "⚪️ Cleared at the near post — no shot on target.",
  },
  {
    callId: "d3",
    correct: "yes",
    points: 12,
    promptAtMs: 20_000,
    question: "🔴 63' — France camped in Brazil's half.\n\nA goal before the 75th minute?",
    resolveAtMs: 26_000,
    result: "🟢 <b>GOAL — Mbappé, 71'!</b> France level it 1–1 — yes, before 75'.",
  },
  {
    callId: "d4",
    correct: "no",
    points: 15,
    promptAtMs: 29_000,
    question: "🏁 88' — 1–1, nerves jangling.\n\nWill the match end level (a draw)?",
    resolveAtMs: 35_000,
    result: "🏁 <b>Rodrygo, 90+2' — Brazil win 2–1!</b> No, it did <b>not</b> end level.",
  },
];

// Kick off the scripted demo for one chat: an intro, then each call's prompt
// and (later) its resolution, then a summary — all fired by the scheduler so
// the match plays out in real time (~37s).
export const startDemo = internalMutation({
  args: { chatId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();

    if (!link) {
      await ctx.scheduler.runAfter(0, internal.telegram.sendMessage, {
        chatId: args.chatId,
        text: "Connect your account first: open PredGame and tap <b>Connect Telegram</b>.",
      });

      return null;
    }

    const userId = link.userId;

    // Fresh start: wipe any answers from a previous demo run.
    const prior = await ctx.db
      .query("liveCallAnswers")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", userId).eq("fixtureId", DEMO_FIXTURE_ID),
      )
      .collect();

    for (const row of prior) {
      await ctx.db.delete(row._id);
    }

    await ctx.scheduler.runAfter(0, internal.telegram.sendMessage, {
      chatId: args.chatId,
      text: "🎬 <b>Demo match — Brazil vs France</b>\nI'll fire a few live calls. Tap ✅/❌ fast, each one scores. Here we go…",
    });

    for (const call of DEMO_CALLS) {
      await ctx.scheduler.runAfter(call.promptAtMs, internal.telegram.sendCallPrompt, {
        callId: call.callId,
        chatId: args.chatId,
        fixtureId: DEMO_FIXTURE_ID,
        question: call.question,
      });
      await ctx.scheduler.runAfter(call.resolveAtMs, internal.telegram.resolveDemoCall, {
        callId: call.callId,
        chatId: args.chatId,
        userId,
      });
    }

    await ctx.scheduler.runAfter(DEMO_END_MS, internal.telegram.demoSummary, {
      chatId: args.chatId,
      userId,
    });

    return null;
  },
});

// Read a player's demo answers (the goalCalls row for the fake fixture), so the
// resolve/summary actions can grade taps.
export const readDemoAnswers = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.null(),
    v.record(
      v.string(),
      v.object({ answer: v.string(), answeredAt: v.string() }),
    ),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("liveCallAnswers")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", args.userId).eq("fixtureId", DEMO_FIXTURE_ID),
      )
      .collect();

    if (rows.length === 0) {
      return null;
    }

    const answers: Record<string, { answer: string; answeredAt: string }> = {};

    for (const row of rows) {
      answers[row.callId] = { answer: row.answer, answeredAt: row.answeredAt };
    }

    return answers;
  },
});

// Reveal what happened on one demo call and score the player's tap.
export const resolveDemoCall = internalAction({
  args: { callId: v.string(), chatId: v.number(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = DEMO_CALLS.find((entry) => entry.callId === args.callId);

    if (!call) {
      return null;
    }

    const answers = await ctx.runQuery(internal.telegram.readDemoAnswers, {
      userId: args.userId,
    });
    const given = answers?.[args.callId]?.answer ?? null;
    const saidLabel = given === "yes" ? "Yes" : "No";
    const correctLabel = call.correct === "yes" ? "Yes" : "No";

    const verdict =
      given == null
        ? `Answer: <b>${correctLabel}</b>. ⏳ You didn't answer in time — 0 pts.`
        : given === call.correct
          ? `Answer: <b>${correctLabel}</b> — you said ${saidLabel}. ✅ <b>+${call.points} pts</b>`
          : `Answer: <b>${correctLabel}</b> — you said ${saidLabel}. ❌ 0 pts.`;

    await telegramFetch("sendMessage", {
      chat_id: args.chatId,
      parse_mode: "HTML",
      text: `${call.result}\n\n${verdict}`,
    });

    return null;
  },
});

// Tally the whole demo and send the full-time summary.
export const demoSummary = internalAction({
  args: { chatId: v.number(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const answers = await ctx.runQuery(internal.telegram.readDemoAnswers, {
      userId: args.userId,
    });

    let total = 0;
    let correct = 0;

    for (const call of DEMO_CALLS) {
      if ((answers?.[call.callId]?.answer ?? null) === call.correct) {
        total += call.points;
        correct += 1;
      }
    }

    await telegramFetch("sendMessage", {
      chat_id: args.chatId,
      parse_mode: "HTML",
      text: `🏁 <b>Full time.</b> You called <b>${correct}/${DEMO_CALLS.length}</b> right for <b>${total} pts</b>.\n\nThat's exactly how live calls work during real World Cup matches — you'll get them here as they happen. Send /demo to replay.`,
    });

    return null;
  },
});
