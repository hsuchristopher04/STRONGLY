import { digest, ensureAuthTables, normalizeEmail } from "../../../auth";
import { db } from "../../../../db";

const env = { DB: db };
const runtimeValue = (name: string) => process.env[name];

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

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return Response.json({ ok: true, devCode: code });
  const apiKey = runtimeValue("RESEND_API_KEY");
  const from = runtimeValue("AUTH_FROM_EMAIL");
  if (typeof apiKey !== "string" || typeof from !== "string") return Response.json({ error: "Email delivery is not configured yet." }, { status: 503 });
  const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": id, "user-agent": "STRONGLY/1.0" }, body: JSON.stringify({ from, to: [email], subject: `${code} is your STRONGLY sign-in code`, text: `Your STRONGLY sign-in code is ${code}. It expires in 10 minutes.` }) });
  return sent.ok ? Response.json({ ok: true }) : Response.json({ error: "We could not send the code. Try again shortly." }, { status: 502 });
}
