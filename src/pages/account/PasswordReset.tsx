// Forgotten password (CC-201): ask for a link, then set a new password with it.
// The reply is the same whether or not the email has an account.

import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Logo } from "../../components/Logo";
import { ApiError, auth } from "../../lib/api";
import { normEmail, passwordRules } from "../../lib/validation";
import { apiErrors, describedBy, Field, focusFirstError, FormError, PasswordChecklist, type Errors } from "./parts";
import "./account.css";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="acct-shell">
      <Link to="/app/login" className="welcome-back"><ArrowLeft size={18} /> Sign in</Link>
      <div className="acct-head">
        <Logo size={56} />
        <h1 className="t-lg">{title}</h1>
      </div>
      <section className="acct-card panel narrow">{children}</section>
    </main>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [sent, setSent] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(undefined);
    const v = normEmail(email);
    if (v.error) { setError(v.error === "Required" ? "Enter your email" : v.error); ref.current?.focus(); return; }
    setError(undefined); setBusy(true);
    try { setSent((await auth.requestReset(email)).message); }
    catch (err) { const x = apiErrors(err); setError(x.errors.email); setMessage(x.message); }
    finally { setBusy(false); }
  };

  return (
    <Shell title="Reset your password">
      {sent ? (
        <div className="stack" role="status">
          <p className="row" style={{ "--gap": "8px", alignItems: "flex-start" } as React.CSSProperties}><MailCheck size={22} aria-hidden="true" /> <span>{sent}</span></p>
          <p className="small muted">Didn't get it? Check your spam folder, or wait a few minutes and ask again.</p>
          <Link to="/app/login" className="btn lg block">Back to sign in</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <FormError message={message} />
          <p className="muted">Enter the email you sign in with. If it has an account, we'll send it a link to choose a new password.</p>
          <Field id="fp-email" label="Email" error={error}>
            <input ref={ref} id="fp-email" name="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy("fp-email", error)} />
          </Field>
          <button className="btn lg block" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  // Read the token once, then take it out of the address bar and history.
  const [token] = useState(() => {
    const t = params.get("token") ?? "";
    if (t) { try { window.history.replaceState(null, "", "#/app/reset-password"); } catch { /* ignore */ } }
    return t;
  });
  const [f, setF] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [expired, setExpired] = useState(!token);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {
      password: passwordRules(f.password).find((r) => !r.ok)?.label,
      confirm: f.confirm !== f.password ? "Passwords don't match" : undefined,
    };
    setErrors(errs); setMessage(undefined);
    if (Object.values(errs).some(Boolean)) { focusFirstError(ref.current, errs); return; }
    setBusy(true);
    try { await auth.confirmReset(token, f.password); setDone(true); }
    catch (err) {
      if (err instanceof ApiError && err.code === "reset_invalid") { setExpired(true); return; }
      const x = apiErrors(err); setErrors(x.errors); setMessage(x.message); focusFirstError(ref.current, x.errors);
    } finally { setBusy(false); }
  };

  if (done) return (
    <Shell title="Password reset">
      <div className="stack" role="status">
        <p>Your password has been changed, and every device that was signed in has been signed out.</p>
        <Link to="/app/login" className="btn lg block">Sign in with your new password</Link>
      </div>
    </Shell>
  );

  if (expired) return (
    <Shell title="This link doesn't work">
      <div className="stack">
        <p className="form-error" role="alert">This reset link has expired or was already used. Links work once, for 30 minutes.</p>
        <Link to="/app/forgot-password" className="btn lg block">Ask for a new link</Link>
      </div>
    </Shell>
  );

  return (
    <Shell title="Choose a new password">
      <form ref={ref} className="stack" onSubmit={submit} noValidate>
        <FormError message={message} />
        <Field id="rp-password" label="New password" error={errors.password}>
          <input id="rp-password" name="password" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-invalid={!!errors.password} aria-describedby={errors.password ? "rp-password-err" : "rp-rules"} />
        </Field>
        <div id="rp-rules"><PasswordChecklist password={f.password} email="" /></div>
        <Field id="rp-confirm" label="Confirm new password" error={errors.confirm}>
          <input id="rp-confirm" name="confirm" className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} aria-invalid={!!errors.confirm} aria-describedby={describedBy("rp-confirm", errors.confirm)} />
        </Field>
        <p className="hint">Every device signed in to your account will be signed out.</p>
        <button className="btn lg block" disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
      </form>
    </Shell>
  );
}
