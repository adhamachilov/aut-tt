import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { configProblems, env } from "@/lib/env";
import { botNext, botTable } from "@/lib/league/server";
import { html, sendMessage } from "@/lib/telegram/bot";

interface Update {
  message?: { chat: { id: number; type: string }; from?: { id: number; first_name?: string }; text?: string };
}

function secretMatches(given: string | null): boolean {
  const expected = env().TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Telegram sends the secret registered by `npm run bot:setup` with every update.
export async function POST(request: Request) {
  if (configProblems().length) return NextResponse.json({ ok: false }, { status: 503 });
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const msg = ((await request.json().catch(() => null)) as Update | null)?.message;
  if (!msg?.text || msg.chat.type !== "private") return NextResponse.json({ ok: true });

  const { APP_URL, LEAGUE_NAME } = env();
  const name = msg.from?.first_name ? `, ${html(msg.from.first_name)}` : "";
  const button = APP_URL ? [[{ text: "🏓 Open League", web_app: { url: APP_URL } }]] : undefined;
  // "/next" or "/next@aut_tt_bot"
  const command = msg.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  try {
    if (command === "/next" && msg.from) {
      await sendMessage(msg.chat.id, await botNext(msg.from.id), button);
    } else if (command === "/table") {
      await sendMessage(msg.chat.id, await botTable(msg.from?.id ?? 0), button);
    } else {
      await sendMessage(
        msg.chat.id,
        `🏓 <b>${html(LEAGUE_NAME)}</b>\n\nHi${name}! Tap the button to register, join the season, see your matches and the table.\n\n/next — your next matches\n/table — the league table`,
        button,
      );
    }
  } catch (e) {
    console.error("[webhook]", e);
  }
  // Always 200 so Telegram doesn't retry.
  return NextResponse.json({ ok: true });
}
