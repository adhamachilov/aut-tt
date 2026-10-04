import "server-only";
import { env } from "@/lib/env";

type Button = { text: string; web_app: { url: string } };

export async function sendMessage(chatId: number, text: string, buttons?: Button[][]) {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; description?: string } | null;
  // Never put the request URL in the error: it contains the token.
  if (!body?.ok) throw new Error(`Telegram sendMessage failed: ${body?.description ?? res.status}`);
}

export function html(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
