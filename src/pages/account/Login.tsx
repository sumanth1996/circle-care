// Sign in with email and password (CC-174, CC-175), then the code from an
// authenticator app or a recovery code when two-step sign-in is on (CC-200),
// or a reset of two-step sign-in when the phone and codes are lost (CC-235).

import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "../../components/Logo";
import { useToast } from "../../components/ui";
import { useAccount } from "../../data/account";
import { auth, type RecoveryWait } from "../../lib/api";
import { apiErrors, Field, FormError, type Errors } from "./parts";
import { CodeStep } from "./security";
import "./account.css";

const START_MESSAGE: Record<string, string> = {
  expired: "For your security we signed you out. Please sign in again.",
  everywhere: "You've been signed out on every device.",
};

export default function Login() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { me, needsSetup, ready, refresh } = useAccount();
  const [f, setF] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | undefined>(params.get("expired") ? START_MESSAGE.expired : params.get("everywhere") ? START_MESSAGE.everywhere : undefined);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryWait>();
  const ref = useRef<HTMLFormElement>(null);

  if (ready && me && !busy) return <Navigate to={me.profileStatus === "complete" ? "/app/account" : `/app/join/${me.role}`} replace />;
  if (ready && needsSetup && !busy) return <Navigate to="/app/two-step" replace />;

  /** Signed in: load the account and go where it needs to go. */
  const finish = async (codesLeft?: number) => {
    const m = await refresh();
    if (codesLeft !== undefined) toast(codesLeft === 1 ? "Signed in. You have 1 recovery code left." : `Signed in. You have ${codesLeft} recovery codes left.`);
    if (m) nav(m.profileStatus === "complete" ? "/app/account" : `/app/join/${m.role}`);
    else nav("/app/two-step"); // a guardian or caregiver who still has to set up two-step sign-in
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = { email: f.email.trim() ? undefined : "Enter your email", password: f.password ? undefined : "Enter your password" };
    setErrors(errs); setMessage(undefined);
    if (errs.email || errs.password) { ref.current?.querySelector<HTMLInputElement>(`[name="${errs.email ? "email" : "password"}"]`)?.focus(); return; }
    setBusy(true);
    try {
      const r = await auth.signIn(f.email, f.password);
      setF({ ...f, password: "" });
      if ("mfaRequired" in r) { setChallenge(r.challenge); setRecovery(r.recovery); setBusy(false); return; }
      await finish();
    } catch (err) {
      const x = apiErrors(err);
      setErrors(x.errors); setMessage(x.message);
      setF({ ...f, password: "" });
      setBusy(false);
    }
  };

  return (
    <main className="acct-shell">
      <Link to="/" className="welcome-back"><ArrowLeft size={18} /> Circle Care website</Link>
      <div className="acct-head">
        <Logo size={56} />
        <h1 className="t-lg">{challenge ? "Enter your sign-in code" : "Sign in"}</h1>
      </div>
      <section className="acct-card panel narrow">
        {challenge ? (
          <CodeStep challenge={challenge} recovery={recovery}
            onSignedIn={async (left) => { setBusy(true); await finish(left); }}
            onReset={async (ended) => {
              setBusy(true);
              await refresh();
              toast(ended ? `Two-step sign-in was reset and ${ended === 1 ? "1 device was" : `${ended} devices were`} signed out. Set it up on your new phone.` : "Two-step sign-in was reset. Set it up on your new phone.");
              nav("/app/two-step");
            }}
            onRestart={(m) => { setChallenge(null); setMessage(m); }} />
        ) : (
          <form ref={ref} className="stack" onSubmit={submit} noValidate>
            <FormError message={message} />
            <Field id="li-email" label="Email" error={errors.email}>
              <input id="li-email" name="email" className="input" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!errors.email} />
            </Field>
            <Field id="li-password" label="Password" error={errors.password}>
              <input id="li-password" name="password" className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-invalid={!!errors.password} />
            </Field>
            <button className="btn lg block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <Link to="/app/forgot-password" className="btn plain block">Forgot your password?</Link>
            <p className="hint center">After 5 wrong passwords, sign-in is paused for 15 minutes to protect your account, and we email you.</p>
          </form>
        )}
      </section>
      <div className="acct-foot">
        <p>New to Circle Care? <Link to="/app/join" className="link">Create an account</Link></p>
        <p className="small muted"><Link to="/app" className="link">Explore the demo</Link> — no account needed.</p>
      </div>
    </main>
  );
}
