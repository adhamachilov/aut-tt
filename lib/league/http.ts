import "server-only";
import { NextResponse } from "next/server";
import { adminTelegramIds, configProblems, devTelegramUserId, env } from "@/lib/env";
import { resolveViewer, type Viewer } from "./viewer";

export class UserError extends Error {}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

export function authenticate(request: Request): { viewer: Viewer } | { response: NextResponse } {
  const problems = configProblems();
  if (problems.length) {
    console.error("[config]", problems.join("; "));
    return { response: json({ error: "The league isn't configured yet. Ask the organizer to finish setup." }, 503) };
  }
  const r = resolveViewer(request.headers.get("authorization"), {
    botToken: env().TELEGRAM_BOT_TOKEN,
    devTelegramUserId: devTelegramUserId(),
    adminIds: adminTelegramIds(),
  });
  return r.ok ? { viewer: r.viewer } : { response: json({ error: r.error }, 401) };
}

// Runs a handler, turning expected failures into 400s with a readable message.
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
