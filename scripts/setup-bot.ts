import { config } from "dotenv";

// One-time bot setup: webhook for /start, and the menu button that opens the Mini App.
config({ path: ".env.local" });
config();

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const appUrl = process.env.APP_URL?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const league = process.env.LEAGUE_NAME?.trim() || "Table Tennis League";

if (!token || !appUrl || !secret) {
  console.error("Set TELEGRAM_BOT_TOKEN, APP_URL (public https URL) and TELEGRAM_WEBHOOK_SECRET in .env.local first.");
  process.exit(1);
}
if (!appUrl.startsWith("https://")) {
  console.error("APP_URL must be a public https:// URL (Telegram requires it). Deploy first, or use a tunnel.");
  process.exit(1);
}

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  console.log(`✓ ${method}`);
}

await call("setWebhook", { url: new URL("/api/telegram/webhook", appUrl).toString(), secret_token: secret, allowed_updates: ["message"] });
await call("setChatMenuButton", { menu_button: { type: "web_app", text: "League", web_app: { url: appUrl } } });
await call("setMyCommands", { commands: [{ command: "start", description: `Open ${league}` }] });
console.log(`\nDone. Open your bot in Telegram and send /start.`);
