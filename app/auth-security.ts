import { db } from "../db";
import { digest } from "./auth";

export const CODE_COOLDOWN_SECONDS = 60;
export const INVALID_CODE_MESSAGE = "That code is invalid or expired. Request a new one.";

type Rule = { scope: string; identifier: string; limit: number; windowMs: number; blockMs?: number };
type Result = { allowed: boolean; retryAfterSeconds: number };

export function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export async function consumeRateLimit(rule: Rule, now = new Date()): Promise<Result> {
  const keyHash = await digest(rule.identifier);
  const nowMs = now.getTime();
  const windowStart = now.toISOString();
  await db.prepare("INSERT INTO auth_rate_limits (scope,key_hash,window_started_at,attempts,updated_at) VALUES (?,?,?,0,?) ON CONFLICT(scope,key_hash) DO NOTHING")
    .bind(rule.scope, keyHash, windowStart, windowStart).run();

  return db.transaction(async (transaction) => {
    const row = await transaction.prepare("SELECT window_started_at,attempts,blocked_until FROM auth_rate_limits WHERE scope=? AND key_hash=? FOR UPDATE")
      .bind(rule.scope, keyHash).first<{ window_started_at: string; attempts: number; blocked_until: string | null }>();
    if (!row) return { allowed: false, retryAfterSeconds: 60 };
    const blockedUntil = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;
    if (blockedUntil > nowMs) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - nowMs) / 1000)) };

    const windowExpires = new Date(row.window_started_at).getTime() + rule.windowMs;
    const attempts = windowExpires <= nowMs ? 0 : row.attempts;
    const effectiveWindowStart = windowExpires <= nowMs ? windowStart : row.window_started_at;
    const nextAttempts = attempts + 1;
    if (nextAttempts > rule.limit) {
      const retryMs = rule.blockMs ?? Math.max(1, new Date(effectiveWindowStart).getTime() + rule.windowMs - nowMs);
      const nextBlockedUntil = new Date(nowMs + retryMs).toISOString();
      await transaction.prepare("UPDATE auth_rate_limits SET window_started_at=?,attempts=?,blocked_until=?,updated_at=? WHERE scope=? AND key_hash=?")
        .bind(effectiveWindowStart, nextAttempts, nextBlockedUntil, windowStart, rule.scope, keyHash).run();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
    }
    await transaction.prepare("UPDATE auth_rate_limits SET window_started_at=?,attempts=?,blocked_until=NULL,updated_at=? WHERE scope=? AND key_hash=?")
      .bind(effectiveWindowStart, nextAttempts, windowStart, rule.scope, keyHash).run();
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

export function limited(retryAfterSeconds: number, message = "Too many requests. Please try again later.") {
  return Response.json({ error: message, retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } });
}

export function noStoreJson(body: object, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}
