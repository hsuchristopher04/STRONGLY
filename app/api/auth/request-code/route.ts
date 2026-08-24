import { digest, ensureAuthTables, normalizeEmail } from "../../../auth";
import { db } from "../../../../db";
import { EmailDeliveryError, mayExposeDevelopmentCode, sendVerificationEmail } from "../../../auth-email";
import { CODE_COOLDOWN_SECONDS, consumeRateLimit, limited, noStoreJson, requestAddress } from "../../../auth-security";

const env = { DB: db };

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  if (!email) return noStoreJson({ error: "Enter a valid email address." }, { status: 400 });
  const address = requestAddress(request);
  const ipLimit = await consumeRateLimit({ scope: "sign-in-request-ip", identifier: address, limit: 20, windowMs: 60 * 60_000 });
  if (!ipLimit.allowed) return limited(ipLimit.retryAfterSeconds);
  const emailLimit = await consumeRateLimit({ scope: "sign-in-request-email", identifier: email, limit: 5, windowMs: 60 * 60_000 });
  if (!emailLimit.allowed) return limited(emailLimit.retryAfterSeconds);
  const recent = await env.DB.prepare("SELECT created_at FROM auth_codes WHERE email=? ORDER BY created_at DESC LIMIT 1").bind(email).first<{ created_at: string }>();
  if (recent) {
    const remaining = CODE_COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 1000);
    if (remaining > 0) return limited(remaining, `Please wait ${remaining} seconds before requesting another code.`);
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
  await env.DB.prepare("INSERT INTO auth_codes (id,email,code_hash,created_at,expires_at,attempts) VALUES (?,?,?,?,?,0)")
    .bind(id, email, await digest(`${id}:${code}`), createdAt.toISOString(), expiresAt.toISOString()).run();

  if (mayExposeDevelopmentCode(request.url)) return noStoreJson({ ok: true, message: "If the address can receive email, a verification code is on the way.", cooldownSeconds: CODE_COOLDOWN_SECONDS, devCode: code });
  try {
    await sendVerificationEmail({ to: email, code, requestId: id });
    return noStoreJson({ ok: true, message: "If the address can receive email, a verification code is on the way.", cooldownSeconds: CODE_COOLDOWN_SECONDS });
  } catch (error) {
    await env.DB.prepare("DELETE FROM auth_codes WHERE id=? AND email=?").bind(id, email).run();
    return noStoreJson({ error: "We couldn't send a code right now. Please try again shortly." }, { status: error instanceof EmailDeliveryError ? error.status : 502 });
  }
}
