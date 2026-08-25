"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json() as { error?: string; message?: string; devCode?: string; cooldownSeconds?: number; retryAfterSeconds?: number };
      if (!response.ok) { setCooldown(payload.retryAfterSeconds ?? 0); return setError(payload.error ?? "We couldn't send a code. Please try again."); }
      setDevCode(payload.devCode ?? ""); setCooldown(payload.cooldownSeconds ?? 60); setNotice(payload.message ?? "If the address can receive email, a verification code is on the way."); setStep("code");
    } catch { setError("We couldn't reach STRONGLY. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault(); await sendCode();
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
      const payload = await response.json() as { error?: string; retryAfterSeconds?: number };
      if (!response.ok) { setCooldown(payload.retryAfterSeconds ?? cooldown); return setError(payload.error ?? "We couldn't verify that code. Please try again."); }
      router.replace("/");
      router.refresh();
    } catch { setError("We couldn't reach STRONGLY. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><Link className="wordmark" href="/">STRONGLY<span>.</span></Link><section className="auth-card">
    <p className="eyebrow">ENTER THE CAMPAIGN</p><h1>{step === "email" ? "Sign in with email" : "Check your inbox"}</h1>
    <p>{step === "email" ? "No password required. We’ll send a one-time code to create or access your account." : `Enter the six-digit code for ${email}.`}</p>
    {step === "email" ? <form onSubmit={submitEmail}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required placeholder="you@example.com" /></label><button className="button button-gold" disabled={busy || cooldown > 0}>{busy ? "Sending…" : cooldown > 0 ? `Try again in ${cooldown}s` : "Send sign-in code"}</button></form> : <form onSubmit={submitCode}><label>Verification code<input className="code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" autoFocus required placeholder="000000" /></label>{devCode && <div className="dev-code">Local test code: <b>{devCode}</b></div>}<button className="button button-gold" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Continue to campaign"}</button><button className="auth-link" type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button><button className="auth-link" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); setNotice(""); }}>Use a different email</button></form>}
    {notice && <p className="auth-notice" role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}<small>Codes expire after 10 minutes. Sessions expire after 7 days. STRONGLY never stores a password.</small>
  </section></main>;
}
