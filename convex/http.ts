import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { telegramFetch } from "./telegram";

const http = httpRouter();

// Telegram's webhook. Registered once via setWebhook with a secret token that
// Telegram then echoes on every call, so we reject anything that isn't it.
// Handles two things: the /start <token> connect handshake (messages) and live
// -call button taps (callback_query).
http.route({
  handler: httpAction(async (ctx, request) => {
    if (
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !==
      process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return new Response("forbidden", { status: 403 });
    }

    const update = await request.json();

    // --- Live-call button tap ------------------------------------------------
    const callback = update.callback_query;

    if (callback) {
      const data: unknown = callback.data;
      const chatId: number | undefined = callback.message?.chat?.id;
      const messageId: number | undefined = callback.message?.message_id;
      const parts = typeof data === "string" ? data.split(":") : [];

      if (parts[0] === "call" && parts.length === 4 && chatId != null) {
        const fixtureId = Number(parts[1]);
        const callId = parts[2];
        const answer = parts[3] === "y" ? "yes" : "no";

        if (Number.isFinite(fixtureId)) {
          await ctx.runMutation(internal.telegram.recordTelegramAnswer, {
            answer,
            callId,
            chatId,
            fixtureId,
          });

          await telegramFetch("answerCallbackQuery", {
            callback_query_id: callback.id,
            text: answer === "yes" ? "Locked in: Yes ✅" : "Locked in: No ✅",
          });

          if (messageId != null) {
            await telegramFetch("editMessageReplyMarkup", {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      callback_data: "noop",
                      text:
                        answer === "yes"
                          ? "✅ You answered: Yes"
                          : "✅ You answered: No",
                    },
                  ],
                ],
              },
            });
          }
        }
      } else {
        // Unknown / already-answered (e.g. the locked "noop" button): just ack
        // so Telegram stops showing the button's loading spinner.
        await telegramFetch("answerCallbackQuery", {
          callback_query_id: callback.id,
        });
      }

      return new Response(null, { status: 200 });
    }

    const message = update.message;
    const text: unknown = message?.text;

    // --- /demo scripted replay ----------------------------------------------
    if (typeof text === "string" && text.startsWith("/demo")) {
      await ctx.runMutation(internal.telegram.startDemo, {
        chatId: message.chat.id,
      });

      return new Response(null, { status: 200 });
    }

    // --- /start connect handshake -------------------------------------------
    if (typeof text === "string" && text.startsWith("/start")) {
      const chatId: number = message.chat.id;
      const username: string | undefined = message.from?.username;
      const token = text.split(/\s+/)[1];

      if (!token) {
        await telegramFetch("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: "👋 Open PredGame and tap <b>Connect Telegram</b> in your account menu to link this chat.",
        });

        return new Response(null, { status: 200 });
      }

      const result = await ctx.runMutation(internal.telegram.redeemLinkToken, {
        chatId,
        token,
        username,
      });

      await telegramFetch("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
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
