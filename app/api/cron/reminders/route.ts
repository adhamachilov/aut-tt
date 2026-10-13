import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { configProblems, env } from "@/lib/env";
import { sendDailyReminders } from "@/lib/league/server";

export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Vercel Cron calls this every morning (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (configProblems().length || !env().TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: false }, { status: 503 });
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await sendDailyReminders();
  return NextResponse.json({ ok: true, ...result });
}
