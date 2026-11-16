// Sign-in security for real accounts (CC-200, CC-201): two-step sign-in setup,
// the code step at sign-in, change password and sign out everywhere.
// The browser-only demo's sign-in (SignIn.tsx) is separate and unchanged.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Copy, KeyRound, LogOut, MailCheck, ShieldCheck, Smartphone } from "lucide-react";
import { useToast } from "../../components/ui";
import { useAccount } from "../../data/account";
import { ApiError, auth, type Me, type MfaSetup, type RecoveryWait } from "../../lib/api";
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
  // CC-200 review: an older sign-in has to confirm the password before a new key is made.
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codesHeadRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (codes) codesHeadRef.current?.focus(); }, [codes]);

  const start = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setMessage(undefined);
    if (needPassword && !password) { setPasswordError("Enter your password"); passwordRef.current?.focus(); return; }
    setPasswordError(undefined); setBusy(true);
    try { setSetup(await auth.startSetup(needPassword ? password : undefined)); setPassword(""); setTimeout(() => codeRef.current?.focus(), 0); }
    catch (err) {
      if (err instanceof ApiError && (err.code === "reauth_required" || err.code === "reauth_failed")) {
        setNeedPassword(true); setPassword("");
        if (err.code === "reauth_failed") setPasswordError(err.message); else setMessage(err.message);
        setTimeout(() => passwordRef.current?.focus(), 0);
      } else setMessage(apiErrors(err).message);
    }
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
        {needPassword ? (
          <form className="stack" onSubmit={start} noValidate>
            <Field id="mfa-setup-password" label="Your password" error={passwordError}>
              <input ref={passwordRef} id="mfa-setup-password" name="password" type="password" className="input" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!passwordError} aria-describedby={describedBy("mfa-setup-password", passwordError)} />
            </Field>
            <button className="btn lg block" disabled={busy}>{busy ? "Checking…" : "Continue setup"}</button>
          </form>
        ) : (
          <button className="btn lg block" onClick={() => start()} disabled={busy}>{busy ? "Starting…" : "Set up two-step sign-in"}</button>
        )}
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

/** When a waiting reset can be finished, in the reader's own time zone. */
export const whenReady = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export function CodeStep({ challenge, recovery, onSignedIn, onRestart, onReset }: {
  challenge: string;
  recovery?: RecoveryWait;
  onSignedIn: (codesLeft?: number) => void | Promise<void>;
  onRestart: (message: string) => void;
  /** CC-235: the reset finished; the new session can only set up two-step sign-in again. */
  onReset: (sessionsEnded: number) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"code" | "recovery" | "lost">(recovery ? "lost" : "code");
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

  if (mode === "lost") return <LostPhone challenge={challenge} recovery={recovery} onRestart={onRestart} onReset={onReset}
    onBack={() => { setMode("code"); setTimeout(() => ref.current?.focus(), 0); }} />;

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
      <button type="button" className="btn plain block" onClick={() => setMode("lost")}>Lost your phone and your recovery codes?</button>
      <p className="hint center">After 5 wrong codes, we stop accepting codes for 15 minutes and email you.</p>
    </form>
  );
}

/* ---------------- Lost phone and recovery codes (CC-235) ---------------- */

function LostPhone({ challenge, recovery, onBack, onRestart, onReset }: {
  challenge: string; recovery?: RecoveryWait; onBack: () => void; onRestart: (message: string) => void; onReset: (sessionsEnded: number) => void | Promise<void>;
}) {
  const [wait, setWait] = useState<RecoveryWait | undefined>(recovery);
  const [sent, setSent] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headRef.current?.focus(); }, [sent, wait]);

  const fail = (err: unknown) => {
    setBusy(false);
    if (err instanceof ApiError && err.code === "mfa_challenge_expired") { onRestart(err.message); return; }
    setMessage(apiErrors(err).message);
  };

  const ask = async () => {
    setBusy(true); setMessage(undefined);
    try {
      const r = await auth.recoveryRequest(challenge);
      if (r.waiting) setWait(r.waiting); else setSent(r.message);
      setBusy(false);
    } catch (err) { fail(err); }
  };

  const finish = async () => {
    setBusy(true); setMessage(undefined);
    try { const r = await auth.recoveryComplete(challenge); await onReset(r.sessionsEnded); }
    catch (err) { fail(err); }
  };

  if (wait?.ready) return (
    <div className="stack">
      <h2 className="t-sm" tabIndex={-1} ref={headRef}>Your reset is ready</h2>
      <FormError message={message} />
      <p className="muted">The waiting period is over and nobody cancelled it. Finishing will remove your old authenticator key and recovery codes, sign out every device, and take you straight to setting up two-step sign-in on your new phone.</p>
      <button className="btn lg block" onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Finish the reset"}</button>
      <button type="button" className="btn plain block" onClick={onBack}>I found my phone</button>
    </div>
  );

  if (wait) return (
    <div className="stack" role="status">
      <h2 className="t-sm row" tabIndex={-1} ref={headRef} style={{ "--gap": "8px" } as React.CSSProperties}><Clock size={20} aria-hidden="true" /> Your reset is waiting</h2>
      <p>You can finish it after <b>{whenReady(wait.readyAt)}</b>. Come back then and sign in with your password.</p>
      <p className="small muted">The wait gives you time to stop a reset you didn't ask for. To cancel it, use the link in the email we sent, or open My account on any device that's still signed in.</p>
      <button type="button" className="btn plain block" onClick={onBack}>Use a code instead</button>
    </div>
  );

  if (sent) return (
    <div className="stack" role="status">
      <h2 className="t-sm row" tabIndex={-1} ref={headRef} style={{ "--gap": "8px" } as React.CSSProperties}><MailCheck size={20} aria-hidden="true" /> Check your email</h2>
      <p>{sent}</p>
      <p className="small muted">Didn't get it? Check your spam folder. You can ask again up to 3 times a day.</p>
      <button type="button" className="btn plain block" onClick={onBack}>Use a code instead</button>
    </div>
  );

  return (
    <div className="stack">
      <h2 className="t-sm" tabIndex={-1} ref={headRef}>Reset two-step sign-in</h2>
      <FormError message={message} />
      <p className="muted">If you've lost your phone and your recovery codes, you can reset two-step sign-in. To keep your account safe, it takes three steps:</p>
      <ol className="small muted reset-steps">
        <li>We email you a link. Open it within 30 minutes.</li>
        <li>We wait 72 hours. Anyone signed in on another device, and the email link, can cancel it.</li>
        <li>You sign in with your password again and set up a new phone.</li>
      </ol>
      <button className="btn lg block" onClick={ask} disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
      <button type="button" className="btn plain block" onClick={onBack}>Use a code instead</button>
    </div>
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
        ? <p className="hint">Lost your phone? Sign in with one of your recovery codes. If you've lost those too, choose "Lost your phone and your recovery codes?" at sign-in.</p>
        : <Link to="/app/two-step" className="btn secondary">Set up two-step sign-in</Link>}
      {me.mfaEnrolled && <WaitingReset />}
      <ChangePassword me={me} />
      <SignOutEverywhere />
    </section>
  );
}

/** CC-235: a reset someone started shows on every signed-in device, with a way to stop it. */
function WaitingReset() {
  const toast = useToast();
  const [wait, setWait] = useState<RecoveryWait | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    let live = true;
    auth.recoveryStatus().then((r) => { if (live) setWait(r.waiting); }).catch(() => { /* nothing to show */ });
    return () => { live = false; };
  }, []);
  if (!wait) return null;

  const cancel = async () => {
    setBusy(true); setMessage(undefined);
    try { await auth.recoveryCancel(); setWait(null); toast("Reset cancelled. Your authenticator app and recovery codes still work."); }
    catch (e) { setMessage(apiErrors(e).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="confirm-row" role="alert" aria-labelledby="wr-h">
      <h3 id="wr-h" className="pm-h">Someone asked to reset two-step sign-in</h3>
      <p className="small">{wait.ready ? "It can be finished now" : `It can be finished after ${whenReady(wait.readyAt)}`}. If this wasn't you, cancel it and change your password.</p>
      <FormError message={message} />
      <div className="row wrap">
        <button className="btn danger" onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel the reset"}</button>
      </div>
    </div>
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
