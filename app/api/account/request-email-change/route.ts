import { db } from "../../../../db";
import { digest, getAuthUser, normalizeEmail } from "../../../auth";
import { EmailDeliveryError, mayExposeDevelopmentCode, sendVerificationEmail } from "../../../auth-email";
import { CODE_COOLDOWN_SECONDS, consumeRateLimit, limited, noStoreJson, requestAddress } from "../../../auth-security";

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return noStoreJson({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const newEmail = normalizeEmail(body?.email ?? "");
  if (!newEmail) return noStoreJson({ error: "Enter a valid email address." }, { status: 400 });
  if (newEmail === auth.email) return noStoreJson({ error: "Enter a different email address." }, { status: 400 });
  if (await db.prepare("SELECT id FROM users WHERE email=? AND id<>?").bind(newEmail, auth.id).first()) return noStoreJson({ error: "That email address cannot be used." }, { status: 400 });
  const ipLimit = await consumeRateLimit({ scope: "email-change-request-ip", identifier: requestAddress(request), limit: 20, windowMs: 60 * 60_000 });
  if (!ipLimit.allowed) return limited(ipLimit.retryAfterSeconds);
  const userLimit = await consumeRateLimit({ scope: "email-change-request-user", identifier: auth.id, limit: 5, windowMs: 60 * 60_000 });
  if (!userLimit.allowed) return limited(userLimit.retryAfterSeconds);
  const recent = await db.prepare("SELECT created_at FROM email_change_codes WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(auth.id).first<{ created_at: string }>();
  if (recent) {
    const remaining = CODE_COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 1000);
    if (remaining > 0) return limited(remaining, `Please wait ${remaining} seconds before requesting another code.`);
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
  await db.prepare("INSERT INTO email_change_codes (id,user_id,new_email,code_hash,created_at,expires_at,attempts) VALUES (?,?,?,?,?,?,0)")
    .bind(id, auth.id, newEmail, await digest(`${id}:${code}`), createdAt.toISOString(), expiresAt.toISOString()).run();
  if (mayExposeDevelopmentCode(request.url)) return noStoreJson({ ok: true, cooldownSeconds: CODE_COOLDOWN_SECONDS, devCode: code });
  try {
    await sendVerificationEmail({ to: newEmail, code, requestId: id, purpose: "email-change" });
    return noStoreJson({ ok: true, cooldownSeconds: CODE_COOLDOWN_SECONDS });
  } catch (error) {
    await db.prepare("DELETE FROM email_change_codes WHERE id=? AND user_id=?").bind(id, auth.id).run();
    return noStoreJson({ error: "We couldn't send a code right now. Please try again shortly." }, { status: error instanceof EmailDeliveryError ? error.status : 502 });
  }
}
