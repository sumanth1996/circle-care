// Sign-in security for real accounts (CC-200, CC-201): two-step sign-in setup,
// the code step at sign-in, change password and sign out everywhere.
// The browser-only demo's sign-in (SignIn.tsx) is separate and unchanged.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, KeyRound, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useToast } from "../../components/ui";
import { useAccount } from "../../data/account";
import { ApiError, auth, type Me, type MfaSetup } from "../../lib/api";
import { passwordRules } from "../../lib/validation";
import { apiErrors, describedBy, Field, focusFirstError, FormError, PasswordChecklist, type Errors } from "./parts";

/** "JBSWY3DPEHPK3PXP…" → ["JBSW", "Y3DP", …] so the key is easier to read and type. */
export const keyGroups = (secret: string) => secret.match(/.{1,4}/g) ?? [];

/* ---------------- Two-step sign-in setup (CC-200) ---------------- */

export function TwoStepSetup({ required, onDone }: { required: boolean; onDone: () => void | Promise<void> }) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"key" | "codes" | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const codesHeadRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (codes) codesHeadRef.current?.focus(); }, [codes]);

  const start = async () => {
    setBusy(true); setMessage(undefined);
    try { setSetup(await auth.startSetup()); setTimeout(() => codeRef.current?.focus(), 0); }
    catch (e) { setMessage(apiErrors(e).message); }
    finally { setBusy(false); }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(undefined);
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your authenticator app"); codeRef.current?.focus(); return; }
    setError(undefined); setBusy(true);
    try {
      const r = await auth.confirmSetup(code);
      setCodes(r.recoveryCodes);
      setSetup(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "mfa_enrol_expired") { setSetup(null); setMessage(err.message); }
      else { const x = apiErrors(err); setError(x.errors.code ?? x.message); codeRef.current?.focus(); }
      setCode("");
    } finally { setBusy(false); }
  };

  const copy = async (what: "key" | "codes", text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(null); }
  };

  if (codes) {
    return (
      <div className="stack">
        <h2 className="t-sm" tabIndex={-1} ref={codesHeadRef}>Save your recovery codes</h2>
        <p className="muted">If you lose your phone, each of these codes lets you sign in once. This is the only time we'll show them, so keep them somewhere safe — a password manager, or printed and put away.</p>
        <ol className="recovery-codes" aria-label="Recovery codes">
          {codes.map((c) => <li key={c}><code>{c}</code></li>)}
        </ol>
        <div className="row wrap">
          <button type="button" className="btn secondary" onClick={() => copy("codes", codes.join("\n"))}><Copy size={18} /> Copy codes</button>
          {copied === "codes" && <span className="small muted" role="status">Copied</span>}
        </div>
        <label className="row check-row" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I've saved my recovery codes somewhere safe</span>
        </label>
        <button className="btn lg block" disabled={!saved || busy} onClick={async () => { setBusy(true); try { await onDone(); } finally { setBusy(false); } }}>Continue</button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="stack">
        <FormError message={message} />
        <p className="muted">
          {required
            ? "Guardians and caregivers can see care and payment details, so your account needs a second step at sign-in: a 6-digit code from an authenticator app on your phone."
            : "Add a second step at sign-in: a 6-digit code from an authenticator app on your phone. Someone who learns your password still can't get in."}
        </p>
        <ul className="small muted setup-list">
          <li><Smartphone size={16} aria-hidden="true" /> Any authenticator app works — for example Google Authenticator, Microsoft Authenticator or your password manager.</li>
          <li><KeyRound size={16} aria-hidden="true" /> You'll also get 10 recovery codes in case you lose your phone.</li>
        </ul>
        <button className="btn lg block" onClick={start} disabled={busy}>{busy ? "Starting…" : "Set up two-step sign-in"}</button>
      </div>
    );
  }

  const groups = keyGroups(setup.secret);
  return (
    <form className="stack" onSubmit={confirm} noValidate>
      <FormError message={message} />
      <section className="stack" aria-labelledby="key-h" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 id="key-h" className="t-sm">1. Add Circle Care to your authenticator app</h2>
        <p className="small muted">In the app, choose to add an account, then enter this key ({setup.account}, time-based):</p>
        <p className="key-groups tnum" aria-label={`Setup key: ${groups.map((g) => g.split("").join(" ")).join(", ")}`}>
          {groups.map((g, i) => <span key={i}>{g}</span>)}
        </p>
        <div className="row wrap">
          <button type="button" className="btn secondary" onClick={() => copy("key", setup.secret)}><Copy size={18} /> Copy key</button>
          {copied === "key" && <span className="small muted" role="status">Copied</span>}
        </div>
        <details className="otpauth">
          <summary>On this phone? Use the setup link instead</summary>
          <p className="small muted">Open the link, or copy it into your authenticator app:</p>
          <p><a href={setup.otpauthUri} className="link">Open in my authenticator app</a></p>
          <code className="otpauth-uri">{setup.otpauthUri}</code>
        </details>
      </section>
      <section className="stack" aria-labelledby="confirm-h" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 id="confirm-h" className="t-sm">2. Enter the code it shows</h2>
        <Field id="mfa-setup-code" label="6-digit code" error={error} hint="The code changes every 30 seconds.">
          <input ref={codeRef} id="mfa-setup-code" name="code" className="input otp tnum" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={!!error} aria-describedby={describedBy("mfa-setup-code", error, true)} />
        </Field>
        <button className="btn lg block" disabled={busy}>{busy ? "Checking…" : "Turn on two-step sign-in"}</button>
      </section>
    </form>
  );
}

/* ---------------- The code step at sign-in (CC-200) ---------------- */

export function CodeStep({ challenge, onSignedIn, onRestart }: { challenge: string; onSignedIn: (codesLeft?: number) => void | Promise<void>; onRestart: (message: string) => void }) {
  const [mode, setMode] = useState<"code" | "recovery">("code");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const id = mode === "code" ? "si-code" : "si-recovery";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(undefined);
    const empty = mode === "code" ? !/^\d{6}$/.test(value) : !value.trim();
    if (empty) { setError(mode === "code" ? "Enter the 6-digit code from your authenticator app" : "Enter one of your recovery codes"); ref.current?.focus(); return; }
    setError(undefined); setBusy(true);
    try {
      const r = await auth.verify(challenge, mode === "code" ? { code: value } : { recoveryCode: value });
      await onSignedIn(r.recoveryCodesLeft);
    } catch (err) {
      setBusy(false); setValue("");
      if (err instanceof ApiError && err.code === "mfa_challenge_expired") { onRestart(err.message); return; }
      const x = apiErrors(err);
      if (x.errors.code || x.errors.recoveryCode) setError(x.errors.code ?? x.errors.recoveryCode);
      else setMessage(x.message);
      ref.current?.focus();
    }
  };

  const switchMode = () => { setMode(mode === "code" ? "recovery" : "code"); setValue(""); setError(undefined); setTimeout(() => ref.current?.focus(), 0); };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <p className="muted">{mode === "code" ? "Open your authenticator app and enter the 6-digit code for Circle Care." : "Enter one of the recovery codes you saved when you set up two-step sign-in. Each code works once."}</p>
      {mode === "code" ? (
        <Field id={id} label="6-digit code" error={error}>
          <input ref={ref} id={id} name="code" className="input otp tnum" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={!!error} aria-describedby={describedBy(id, error)} />
        </Field>
      ) : (
        <Field id={id} label="Recovery code" error={error}>
          <input ref={ref} id={id} name="recoveryCode" className="input tnum" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxxx-xxxxx"
            value={value} onChange={(e) => setValue(e.target.value.slice(0, 32))} aria-invalid={!!error} aria-describedby={describedBy(id, error)} />
        </Field>
      )}
      <button className="btn lg block" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" className="btn plain block" onClick={switchMode}>{mode === "code" ? "Use a recovery code instead" : "Use the code from my app"}</button>
      <p className="hint center">After 5 wrong codes, we stop accepting codes for 15 minutes and email you.</p>
    </form>
  );
}

/* ---------------- My account → Sign-in & security (CC-200, CC-201) ---------------- */

export function SignInSecurity({ me }: { me: Me }) {
  return (
    <section className="panel" aria-labelledby="signin-sec-h">
      <h2 id="signin-sec-h" className="t-sm row" style={{ "--gap": "8px" } as React.CSSProperties}><ShieldCheck size={20} /> Sign-in & security</h2>
      <div className="kv">
        <span>Two-step sign-in</span>
        {me.mfaEnrolled ? <span className="badge green">On · authenticator app</span> : <span className="badge yellow">Off</span>}
      </div>
      {me.mfaEnrolled
        ? <p className="hint">Lost your phone? Sign in with one of your recovery codes.</p>
        : <Link to="/app/two-step" className="btn secondary">Set up two-step sign-in</Link>}
      <ChangePassword me={me} />
      <SignOutEverywhere />
    </section>
  );
}

function ChangePassword({ me }: { me: Me }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const nav = useNavigate();
  const { setMe } = useAccount();

  if (!open) return <button className="btn plain" onClick={() => setOpen(true)}>Change password</button>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {
      currentPassword: f.currentPassword ? undefined : "Enter your current password.",
      newPassword: passwordRules(f.newPassword, me.loginEmail).find((r) => !r.ok)?.label,
      confirm: f.confirm !== f.newPassword ? "Passwords don't match" : undefined,
    };
    setErrors(errs); setMessage(undefined);
    if (Object.values(errs).some(Boolean)) { focusFirstError(ref.current, errs); return; }
    setBusy(true);
    try {
      const r = await auth.changePassword(f.currentPassword, f.newPassword);
      setF({ currentPassword: "", newPassword: "", confirm: "" }); setOpen(false);
      toast(r.otherSessionsEnded ? `Password changed. ${r.otherSessionsEnded === 1 ? "1 other device was" : `${r.otherSessionsEnded} other devices were`} signed out.` : "Password changed");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) { setMe(null); nav("/app/login"); return; }
      const x = apiErrors(err); setErrors(x.errors); setMessage(x.message); focusFirstError(ref.current, x.errors);
    } finally { setBusy(false); }
  };

  const input = (k: keyof typeof f, label: string, autoComplete: string, extra?: { describedBy?: string }) => (
    <Field id={`cp-${k}`} label={label} error={errors[k]}>
      <input id={`cp-${k}`} name={k} className="input" type="password" autoComplete={autoComplete} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `cp-${k}-err` : extra?.describedBy} />
    </Field>
  );

  return (
    <form ref={ref} className="stack sub-form" onSubmit={submit} noValidate aria-labelledby="cp-h">
      <h3 id="cp-h" className="pm-h">Change password</h3>
      <FormError message={message} />
      {input("currentPassword", "Current password", "current-password")}
      {input("newPassword", "New password", "new-password", { describedBy: "cp-rules" })}
      <div id="cp-rules"><PasswordChecklist password={f.newPassword} email={me.loginEmail} /></div>
      {input("confirm", "Confirm new password", "new-password")}
      <p className="hint">Your other devices will be signed out. This one stays signed in.</p>
      <div className="row wrap">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        <button type="button" className="btn plain" onClick={() => { setOpen(false); setErrors({}); setMessage(undefined); }}>Cancel</button>
      </div>
    </form>
  );
}

function SignOutEverywhere() {
  const nav = useNavigate();
  const { setMe } = useAccount();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const go = async () => {
    setBusy(true); setMessage(undefined);
    try {
      await auth.signOutEverywhere();
      setMe(null);
      nav("/app/login?everywhere=1");
    } catch (e) { setMessage(apiErrors(e).message); setBusy(false); }
  };

  return (
    <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
      <FormError message={message} />
      {confirming ? (
        <div className="confirm-row" role="group" aria-labelledby="soe-q">
          <p id="soe-q" className="small">Sign out on every device, including this one? Anyone using your account anywhere will have to sign in again.</p>
          <div className="row wrap">
            <button className="btn danger" onClick={go} disabled={busy}><LogOut size={16} /> {busy ? "Signing out…" : "Sign out everywhere"}</button>
            <button className="btn plain" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : <button className="btn plain" onClick={() => setConfirming(true)}><LogOut size={16} /> Sign out everywhere</button>}
    </div>
  );
}
