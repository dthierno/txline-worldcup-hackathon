import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Telegram's webhook. Registered once via setWebhook with a secret token that
// Telegram then echoes on every call, so we can reject anything that isn't it.
// For now it only handles the /start <token> connect handshake; live-call
// button taps (callback_query) get added when we start sending prompts.
http.route({
  handler: httpAction(async (ctx, request) => {
    if (
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
      process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return new Response("forbidden", { status: 403 });
    }

    const update = await request.json();
    const message = update.message;
    const text: unknown = message?.text;

    if (typeof text === "string" && text.startsWith("/start")) {
      const chatId: number = message.chat.id;
      const username: string | undefined = message.from?.username;
      const token = text.split(/\s+/)[1];

      if (!token) {
        await ctx.runAction(internal.telegram.sendMessage, {
          chatId,
          text: "👋 Open PredGame and tap <b>Connect Telegram</b> in your account menu to link this chat.",
        });

        return new Response(null, { status: 200 });
      }

      const result = await ctx.runMutation(internal.telegram.redeemLinkToken, {
        chatId,
        token,
        username,
      });

      await ctx.runAction(internal.telegram.sendMessage, {
        chatId,
        text: result
          ? "✅ <b>Linked!</b> You'll get live call prompts here during matches."
          : "⚠️ That link expired. Open PredGame and tap <b>Connect Telegram</b> again.",
      });
    }

    return new Response(null, { status: 200 });
  }),
  method: "POST",
  path: "/telegram/webhook",
});

export default http;
