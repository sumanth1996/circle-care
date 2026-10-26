// Sign in with email and password (CC-174, CC-175).

import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "../../components/Logo";
import { useAccount } from "../../data/account";
import { api, type Me } from "../../lib/api";
import { apiErrors, Field, FormError, type Errors } from "./parts";
import "./account.css";

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { me, ready, setMe } = useAccount();
  const [f, setF] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | undefined>(params.get("expired") ? "For your security we signed you out. Please sign in again." : undefined);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  if (ready && me && !busy) return <Navigate to={me.profileStatus === "complete" ? "/app/account" : `/app/join/${me.role}`} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = { email: f.email.trim() ? undefined : "Enter your email", password: f.password ? undefined : "Enter your password" };
    setErrors(errs); setMessage(undefined);
    if (errs.email || errs.password) { ref.current?.querySelector<HTMLInputElement>(`[name="${errs.email ? "email" : "password"}"]`)?.focus(); return; }
    setBusy(true);
    try {
      await api("/api/auth/signin", { body: f });
      const r = await api<{ me: Me }>("/api/me");
      setMe(r.me);
      nav(r.me.profileStatus === "complete" ? "/app/account" : `/app/join/${r.me.role}`);
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
        <h1 className="t-lg">Sign in</h1>
      </div>
      <section className="acct-card panel narrow">
        <form ref={ref} className="stack" onSubmit={submit} noValidate>
          <FormError message={message} />
          <Field id="li-email" label="Email" error={errors.email}>
            <input id="li-email" name="email" className="input" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={!!errors.email} />
          </Field>
          <Field id="li-password" label="Password" error={errors.password}>
            <input id="li-password" name="password" className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-invalid={!!errors.password} />
          </Field>
          <button className="btn lg block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="hint center">After 5 wrong passwords, sign-in is paused for 15 minutes to protect your account.</p>
        </form>
      </section>
      <div className="acct-foot">
        <p>New to Circle Care? <Link to="/app/join" className="link">Create an account</Link></p>
        <p className="small muted"><Link to="/app" className="link">Explore the demo</Link> — no account needed.</p>
      </div>
    </main>
  );
}
