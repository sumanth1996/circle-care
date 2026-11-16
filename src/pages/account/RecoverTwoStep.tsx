// The two emailed links for resetting two-step sign-in (CC-235): one starts the
// 72-hour wait, the other cancels it. Each link is read once and taken out of
// the address bar, and nothing happens until the person presses the button,
// so a mail scanner that opens links can't start or stop a reset.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { Logo } from "../../components/Logo";
import { ApiError, auth } from "../../lib/api";
import { apiErrors, FormError } from "./parts";
import { whenReady } from "./security";
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

function useOnceToken(path: string) {
  const [params] = useSearchParams();
  const [token] = useState(() => {
    const t = params.get("token") ?? "";
    if (t) { try { window.history.replaceState(null, "", `#${path}`); } catch { /* ignore */ } }
    return t;
  });
  return token;
}

const BadLink = ({ what }: { what: string }) => (
  <Shell title="This link doesn't work">
    <div className="stack">
      <p className="form-error" role="alert">This {what} link has expired or was already used.</p>
      <Link to="/app/login" className="btn lg block">Go to sign in</Link>
    </div>
  </Shell>
);

export function RecoverTwoStep() {
  const token = useOnceToken("/app/recover-two-step");
  const [bad, setBad] = useState(!token);
  const [readyAt, setReadyAt] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true); setMessage(undefined);
    try { setReadyAt((await auth.recoveryConfirm(token)).readyAt); }
    catch (err) {
      if (err instanceof ApiError && err.code === "recovery_link_invalid") { setBad(true); return; }
      setMessage(apiErrors(err).message);
    } finally { setBusy(false); }
  };

  if (bad) return <BadLink what="reset" />;
  if (readyAt) return (
    <Shell title="The wait has started">
      <div className="stack" role="status">
        <p className="row" style={{ "--gap": "8px", alignItems: "flex-start" } as React.CSSProperties}><Clock size={22} aria-hidden="true" /> <span>You can finish the reset after <b>{whenReady(readyAt)}</b>.</span></p>
        <p className="small muted">Then sign in with your password, choose "Lost your phone and your recovery codes?" and set up your new phone. We've emailed you a link to cancel it if you change your mind.</p>
        <Link to="/app/login" className="btn lg block">Back to sign in</Link>
      </div>
    </Shell>
  );
  return (
    <Shell title="Reset two-step sign-in?">
      <div className="stack">
        <FormError message={message} />
        <p className="muted">This starts a 72-hour wait. When it ends, you can sign in with just your password and set up two-step sign-in on a new phone.</p>
        <p className="small muted">During the wait, anyone signed in to your account on another device can cancel it, and so can the link in the next email we send you. If you didn't ask for this, close this page and nothing will change.</p>
        <button className="btn lg block" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start the 72-hour wait"}</button>
      </div>
    </Shell>
  );
}

export function CancelTwoStepReset() {
  const token = useOnceToken("/app/recover-two-step/cancel");
  const [bad, setBad] = useState(!token);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true); setMessage(undefined);
    try { await auth.recoveryCancel(token); setDone(true); }
    catch (err) {
      if (err instanceof ApiError && err.code === "recovery_link_invalid") { setBad(true); return; }
      setMessage(apiErrors(err).message);
    } finally { setBusy(false); }
  };

  if (bad) return <BadLink what="cancel" />;
  if (done) return (
    <Shell title="Reset cancelled">
      <div className="stack" role="status">
        <p className="row" style={{ "--gap": "8px", alignItems: "flex-start" } as React.CSSProperties}><ShieldCheck size={22} aria-hidden="true" /> <span>Nothing changed. Your authenticator app and recovery codes still work.</span></p>
        <p className="small muted">If you didn't ask for the reset, someone may know your password. Sign in and change it.</p>
        <Link to="/app/login" className="btn lg block">Go to sign in</Link>
      </div>
    </Shell>
  );
  return (
    <Shell title="Cancel the reset?">
      <div className="stack">
        <FormError message={message} />
        <p className="muted">Someone asked to reset two-step sign-in on your Circle Care account. Cancelling keeps your authenticator app and recovery codes as they are.</p>
        <button className="btn danger lg block" onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel the reset"}</button>
      </div>
    </Shell>
  );
}
