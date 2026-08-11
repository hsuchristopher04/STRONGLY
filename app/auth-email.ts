type RuntimeEnvironment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export class EmailDeliveryError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
  }
}

function configuredValue(environment: RuntimeEnvironment, name: string) {
  const value = environment[name]?.trim();
  if (!value || /replace[_-]?me|your-verified-domain/i.test(value)) {
    throw new EmailDeliveryError("Email delivery is not configured yet.", 503);
  }
  return value;
}

export function resendConfiguration(environment: RuntimeEnvironment = process.env) {
  const apiKey = configuredValue(environment, "RESEND_API_KEY");
  const from = configuredValue(environment, "AUTH_FROM_EMAIL");
  if (!apiKey.startsWith("re_")) throw new EmailDeliveryError("Email delivery is not configured yet.", 503);
  const senderAddress = from.match(/<([^>]+)>$/)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) throw new EmailDeliveryError("Email delivery is not configured yet.", 503);
  return { apiKey, from, replyTo: environment.AUTH_REPLY_TO?.trim() || undefined };
}

export function mayExposeDevelopmentCode(requestUrl: string, environment: RuntimeEnvironment = process.env) {
  if (environment.NODE_ENV === "production" || environment.AUTH_SHOW_DEV_CODE === "false") return false;
  const hostname = new URL(requestUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function sendVerificationEmail(input: {
  to: string;
  code: string;
  requestId: string;
  purpose?: "sign-in" | "email-change";
  environment?: RuntimeEnvironment;
  fetcher?: Fetcher;
}) {
  const configuration = resendConfiguration(input.environment);
  const fetcher = input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.requestId,
        "user-agent": "STRONGLY/1.0",
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [input.to],
        reply_to: configuration.replyTo,
        subject: `${input.code} is your STRONGLY ${input.purpose === "email-change" ? "email change" : "sign-in"} code`,
        text: `Your STRONGLY ${input.purpose === "email-change" ? "email change" : "sign-in"} code is ${input.code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
        html: `<!doctype html><html><body style="margin:0;background:#08100c;color:#f4efe3;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:48px 24px"><p style="color:#d9b44a;letter-spacing:3px;font-weight:700">STRONGLY.</p><div style="border:1px solid #425044;background:#111a15;padding:32px"><p style="margin-top:0;color:#aeb8b0">Your one-time ${input.purpose === "email-change" ? "email change" : "sign-in"} code is</p><p style="margin:20px 0;font-size:38px;font-weight:800;letter-spacing:10px;color:#f0c94f">${input.code}</p><p style="color:#aeb8b0;line-height:1.6">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p></div></div></body></html>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailDeliveryError("We could not send the code. Try again shortly.", 502);
  }
  if (!response.ok) throw new EmailDeliveryError("We could not send the code. Try again shortly.", response.status === 401 || response.status === 403 ? 503 : 502);
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!payload?.id) throw new EmailDeliveryError("We could not confirm email delivery. Try again shortly.", 502);
  return { id: payload.id };
}
