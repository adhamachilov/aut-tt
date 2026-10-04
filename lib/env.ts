import "server-only";
import { z } from "zod";

// Server-only configuration. No variable uses NEXT_PUBLIC_, so none reach the browser.
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]{20,}$/, "looks malformed").optional(),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional(),
  APP_URL: z.url().optional(),
  LEAGUE_NAME: z.string().min(1).default("Table Tennis League"),
  ADMIN_TELEGRAM_IDS: z
    .string()
    .regex(/^\d+(\s*,\s*\d+)*$/, "must be comma-separated Telegram user IDs")
    .optional(),
  MAJORS: z.string().optional(),
  DEV_TELEGRAM_USER_ID: z.coerce.number().int().positive().optional(),
  ALLOW_DEV_TELEGRAM_LOGIN: z.enum(["true", "false"]).optional(),
});

export type Env = z.infer<typeof schema>;

// Blank values (`KEY=` copied from .env.example) count as unset rather than invalid.
function rawEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    const t = v?.trim();
    if (t) out[k] = t;
  }
  if (!out.SUPABASE_SERVICE_ROLE_KEY && out.SUPABASE_SECRET_KEY) out.SUPABASE_SERVICE_ROLE_KEY = out.SUPABASE_SECRET_KEY;
  return out;
}

export function configProblems(): string[] {
  const raw = rawEnv();
  const parsed = schema.safeParse(raw);
  if (parsed.success) return [];
  return [
    ...new Set(
      parsed.error.issues.map((i) => {
        const key = String(i.path[0]);
        return raw[key] === undefined ? `${key} is missing` : `${key} ${i.message}`;
      }),
    ),
  ];
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(rawEnv());
  if (!parsed.success) throw new Error(`Server is not configured: ${configProblems().join("; ")}. See .env.example.`);
  cached = parsed.data;
  return cached;
}

export function adminTelegramIds(): Set<number> {
  return new Set((env().ADMIN_TELEGRAM_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n > 0));
}

export function majorOptions(): string[] {
  return (env().MAJORS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Lets a normal browser act as this Telegram user while developing. Never in production.
export function devTelegramUserId(): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const e = env();
  return e.ALLOW_DEV_TELEGRAM_LOGIN === "true" && e.DEV_TELEGRAM_USER_ID ? e.DEV_TELEGRAM_USER_ID : null;
}
