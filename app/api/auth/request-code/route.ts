import { digest, ensureAuthTables, normalizeEmail } from "../../../auth";
import { db } from "../../../../db";
import { EmailDeliveryError, mayExposeDevelopmentCode, sendVerificationEmail } from "../../../auth-email";

const env = { DB: db };

export async function POST(request: Request) {
  await ensureAuthTables();
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  if (!email) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const recent = await env.DB.prepare("SELECT created_at FROM auth_codes WHERE email=? ORDER BY created_at DESC LIMIT 1").bind(email).first<{ created_at: string }>();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) return Response.json({ error: "Wait a minute before requesting another code." }, { status: 429 });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60_000);
  await env.DB.prepare("INSERT INTO auth_codes (id,email,code_hash,created_at,expires_at,attempts) VALUES (?,?,?,?,?,0)")
    .bind(id, email, await digest(`${id}:${code}`), createdAt.toISOString(), expiresAt.toISOString()).run();

  if (mayExposeDevelopmentCode(request.url)) return Response.json({ ok: true, devCode: code });
  try {
    await sendVerificationEmail({ to: email, code, requestId: id });
    return Response.json({ ok: true });
  } catch (error) {
    await env.DB.prepare("DELETE FROM auth_codes WHERE id=? AND email=?").bind(id, email).run();
    return Response.json(
      { error: error instanceof Error ? error.message : "We could not send the code. Try again shortly." },
      { status: error instanceof EmailDeliveryError ? error.status : 502 },
    );
  }
}
