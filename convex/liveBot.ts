import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { telegramFetch } from "./telegram";
import { getFixtureScore, type FixtureScore } from "./txline";

// A goal-window call stays open for this long, then the next opens after a gap,
// so a fan gets one prompt roughly every (WINDOW + GAP) of play.
const WINDOW_MS = 8 * 60 * 1000;
const GAP_AFTER_MS = 3 * 60 * 1000;
// Same value the web app awards a live call (prediction-store GOAL_CALL_POINTS).
const CALL_POINTS = 2;

type OpenCall = {
  baselineTotalGoals: number;
  callId: string;
  windowEndMs: number;
};

type Plan =
  | { baselineTotalGoals: number; kind: "open"; windowEndMs: number }
  | { callId: string; correctAnswer: "no" | "yes"; kind: "resolve" }
  | { kind: "none" };

// Pure decision for one fixture on one poll — no I/O, so it's unit-testable.
// Resolve an open call once its window elapses or the match ends; otherwise open
// a fresh one when the match is live, nothing is open, and the cadence gap has
// passed since the previous call started.
export function planGoalWindow(input: {
  lastCallCreatedAtMs: number | null;
  nowMs: number;
  openCall: OpenCall | null;
  score: FixtureScore;
}): Plan {
  const { lastCallCreatedAtMs, nowMs, openCall, score } = input;

  if (openCall && (nowMs >= openCall.windowEndMs || score.ended)) {
    return {
      callId: openCall.callId,
      correctAnswer:
        score.totalGoals > openCall.baselineTotalGoals ? "yes" : "no",
      kind: "resolve",
    };
  }

  if (openCall || !score.inPlay) {
    return { kind: "none" };
  }

  if (
    lastCallCreatedAtMs !== null &&
    nowMs - lastCallCreatedAtMs < WINDOW_MS + GAP_AFTER_MS
  ) {
    return { kind: "none" };
  }

  return {
    baselineTotalGoals: score.totalGoals,
    kind: "open",
    windowEndMs: nowMs + WINDOW_MS,
  };
}

function minuteLabel(clockSeconds?: number): string {
  return typeof clockSeconds === "number"
    ? `${Math.floor(clockSeconds / 60) + 1}'`
    : "";
}

function scoreLine(
  fixture: { awayTeam: string; homeTeam: string },
  score: FixtureScore,
): string {
  return `${fixture.homeTeam} ${score.homeGoals}–${score.awayGoals} ${fixture.awayTeam}`;
}

// --- queries / mutations ---------------------------------------------------

export const listWatched = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      awayTeam: v.string(),
      fixtureId: v.number(),
      homeTeam: v.string(),
    }),
  ),
  handler: async (ctx) => {
    // We watch a handful of matches at a time; the cap is just a safety bound.
    const rows = await ctx.db.query("watchedFixtures").take(200);

    return rows.map((row) => ({
      awayTeam: row.awayTeam,
      fixtureId: row.fixtureId,
      homeTeam: row.homeTeam,
    }));
  },
});

export const fixtureCallState = internalQuery({
  args: { fixtureId: v.number() },
  returns: v.object({
    lastCreatedAtMs: v.union(v.null(), v.number()),
    openCall: v.union(
      v.null(),
      v.object({
        baselineTotalGoals: v.number(),
        callId: v.string(),
        windowEndMs: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("liveCalls")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .collect();

    const open = calls.find((call) => call.status === "open") ?? null;
    const lastCreatedAtMs = calls.reduce<number | null>(
      (latest, call) => (latest === null ? call.createdAt : Math.max(latest, call.createdAt)),
      null,
    );

    return {
      lastCreatedAtMs,
      openCall: open
        ? {
            baselineTotalGoals: open.baselineTotalGoals,
            callId: open.callId,
            windowEndMs: open.windowEndMs,
          }
        : null,
    };
  },
});

export const activeLinks = internalQuery({
  args: {},
  returns: v.array(v.object({ chatId: v.number(), userId: v.string() })),
  handler: async (ctx) => {
    const links = await ctx.db.query("telegramLinks").take(2000);

    return links
      .filter((link) => !link.muted)
      .map((link) => ({ chatId: link.chatId, userId: link.userId }));
  },
});

export const readAnswer = internalQuery({
  args: { callId: v.string(), fixtureId: v.number(), userId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("goalCalls")
      .withIndex("by_user_fixture", (q) =>
        q.eq("userId", args.userId).eq("fixtureId", args.fixtureId),
      )
      .first();

    return row?.answers[args.callId]?.answer ?? null;
  },
});

export const insertCall = internalMutation({
  args: {
    baselineTotalGoals: v.number(),
    callId: v.string(),
    createdAt: v.number(),
    fixtureId: v.number(),
    question: v.string(),
    windowEndMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("liveCalls", {
      baselineTotalGoals: args.baselineTotalGoals,
      callId: args.callId,
      createdAt: args.createdAt,
      fixtureId: args.fixtureId,
      question: args.question,
      status: "open",
      windowEndMs: args.windowEndMs,
    });

    return null;
  },
});

export const markResolved = internalMutation({
  args: {
    callId: v.string(),
    correctAnswer: v.string(),
    resolvedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = await ctx.db
      .query("liveCalls")
      .withIndex("by_callId", (q) => q.eq("callId", args.callId))
      .first();

    if (call && call.status === "open") {
      await ctx.db.patch(call._id, {
        correctAnswer: args.correctAnswer,
        resolvedAt: args.resolvedAt,
        status: "resolved",
      });
    }

    return null;
  },
});

// Admin: point the poller at a match (or stop watching it).
export const watchFixture = internalMutation({
  args: { awayTeam: v.string(), fixtureId: v.number(), homeTeam: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchedFixtures")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .first();

    if (!existing) {
      await ctx.db.insert("watchedFixtures", {
        addedAt: Date.now(),
        awayTeam: args.awayTeam,
        fixtureId: args.fixtureId,
        homeTeam: args.homeTeam,
      });
    }

    return null;
  },
});

export const unwatchFixture = internalMutation({
  args: { fixtureId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("watchedFixtures")
      .withIndex("by_fixture", (q) => q.eq("fixtureId", args.fixtureId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return null;
  },
});

export const setMuted = internalMutation({
  args: { chatId: v.number(), muted: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("telegramLinks")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();

    if (!link) {
      return false;
    }

    await ctx.db.patch(link._id, { muted: args.muted });

    return true;
  },
});

// --- orchestration (actions) ----------------------------------------------

async function openAndSend(
  ctx: ActionCtx,
  fixture: { awayTeam: string; fixtureId: number; homeTeam: string },
  score: FixtureScore,
  windowEndMs: number,
  baselineTotalGoals: number,
  nowMs: number,
): Promise<void> {
  const callId = `gw-${fixture.fixtureId}-${nowMs}`;
  const windowMin = Math.max(1, Math.round((windowEndMs - nowMs) / 60_000));
  const question = `⚽️ ${minuteLabel(score.clockSeconds)} — ${scoreLine(fixture, score)}\n\nWill there be a goal in the next ${windowMin} minute${windowMin === 1 ? "" : "s"}?`;

  await ctx.runMutation(internal.liveBot.insertCall, {
    baselineTotalGoals,
    callId,
    createdAt: nowMs,
    fixtureId: fixture.fixtureId,
    question,
    windowEndMs,
  });

  const links = await ctx.runQuery(internal.liveBot.activeLinks, {});

  for (const link of links) {
    await ctx.runAction(internal.telegram.sendCallPrompt, {
      callId,
      chatId: link.chatId,
      fixtureId: fixture.fixtureId,
      question,
    });
  }
}

async function announceResolution(
  ctx: ActionCtx,
  fixture: { awayTeam: string; fixtureId: number; homeTeam: string },
  callId: string,
  correctAnswer: "no" | "yes",
  score: FixtureScore,
): Promise<void> {
  const outcome =
    correctAnswer === "yes"
      ? `🟢 <b>Goal!</b> ${scoreLine(fixture, score)}.`
      : `⚪️ No goal. ${scoreLine(fixture, score)}.`;

  const links = await ctx.runQuery(internal.liveBot.activeLinks, {});

  for (const link of links) {
    const answer = await ctx.runQuery(internal.liveBot.readAnswer, {
      callId,
      fixtureId: fixture.fixtureId,
      userId: link.userId,
    });

    // Only follow up with people who actually called it.
    if (!answer) {
      continue;
    }

    const said = answer === "yes" ? "Yes" : "No";
    const verdict =
      answer === correctAnswer
        ? `✅ You said ${said} — <b>+${CALL_POINTS} pts</b>`
        : `❌ You said ${said} — 0 pts`;

    await telegramFetch("sendMessage", {
      chat_id: link.chatId,
      parse_mode: "HTML",
      text: `${outcome}\n\n${verdict}`,
    });
  }
}

async function pollOne(
  ctx: ActionCtx,
  fixture: { awayTeam: string; fixtureId: number; homeTeam: string },
): Promise<void> {
  const score = await getFixtureScore(fixture.fixtureId);
  const state = await ctx.runQuery(internal.liveBot.fixtureCallState, {
    fixtureId: fixture.fixtureId,
  });
  const nowMs = Date.now();

  const plan = planGoalWindow({
    lastCallCreatedAtMs: state.lastCreatedAtMs,
    nowMs,
    openCall: state.openCall,
    score,
  });

  if (plan.kind === "resolve") {
    await ctx.runMutation(internal.liveBot.markResolved, {
      callId: plan.callId,
      correctAnswer: plan.correctAnswer,
      resolvedAt: nowMs,
    });
    await announceResolution(ctx, fixture, plan.callId, plan.correctAnswer, score);
  } else if (plan.kind === "open") {
    await openAndSend(
      ctx,
      fixture,
      score,
      plan.windowEndMs,
      plan.baselineTotalGoals,
      nowMs,
    );
  }
}

// Cron target: sweep every watched fixture. One fixture failing (feed hiccup)
// must not block the others.
export const pollLiveMatches = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const watched = await ctx.runQuery(internal.liveBot.listWatched, {});

    for (const fixture of watched) {
      try {
        await pollOne(ctx, fixture);
      } catch (error) {
        console.error(`live poll failed for ${fixture.fixtureId}:`, error);
      }
    }

    return null;
  },
});

// Test-only: force-open a short-window call for one watched fixture, ignoring
// the live gate, so the real open -> tap -> resolve -> DM path can be exercised
// without waiting for kickoff. The next poll resolves it.
export const debugOpenCall = internalAction({
  args: { fixtureId: v.number(), windowSeconds: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const watched = await ctx.runQuery(internal.liveBot.listWatched, {});
    const fixture = watched.find((row) => row.fixtureId === args.fixtureId);

    if (!fixture) {
      throw new Error(`Fixture ${args.fixtureId} is not watched.`);
    }

    const score = await getFixtureScore(args.fixtureId);
    const nowMs = Date.now();
    const windowEndMs = nowMs + (args.windowSeconds ?? 90) * 1000;

    await openAndSend(ctx, fixture, score, windowEndMs, score.totalGoals, nowMs);

    return `opened a ${args.windowSeconds ?? 90}s call for ${fixture.homeTeam} vs ${fixture.awayTeam}`;
  },
});
