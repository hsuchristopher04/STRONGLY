"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");

  async function submitEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = await response.json() as { error?: string; devCode?: string };
    setBusy(false);
    if (!response.ok) return setError(payload.error ?? "Unable to send code.");
    setDevCode(payload.devCode ?? ""); setStep("code");
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
    const payload = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return setError(payload.error ?? "Unable to sign in.");
    window.location.assign("/");
  }

  return <main className="auth-page"><Link className="wordmark" href="/">STRONGLY<span>.</span></Link><section className="auth-card">
    <p className="eyebrow">ENTER THE CAMPAIGN</p><h1>{step === "email" ? "Sign in with email" : "Check your inbox"}</h1>
    <p>{step === "email" ? "No password required. We’ll send a one-time code to create or access your account." : `Enter the six-digit code sent to ${email}.`}</p>
    {step === "email" ? <form onSubmit={submitEmail}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required placeholder="you@example.com" /></label><button className="button button-gold" disabled={busy}>{busy ? "Sending…" : "Send sign-in code"}</button></form> : <form onSubmit={submitCode}><label>Verification code<input className="code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" autoFocus required placeholder="000000" /></label>{devCode && <div className="dev-code">Local test code: <b>{devCode}</b></div>}<button className="button button-gold" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Continue to campaign"}</button><button className="auth-link" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button></form>}
    {error && <p className="auth-error" role="alert">{error}</p>}<small>Codes expire after 10 minutes. STRONGLY never stores a password.</small>
  </section></main>;
}
