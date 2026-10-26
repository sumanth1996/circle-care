// Role-based sign-up (CC-172, CC-173) and the profile steps that follow:
// Identity (SSN, CC-180) → Photo (CC-179) → Bank account for guardians (CC-186).

import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, HeartHandshake, Scale, User } from "lucide-react";
import { Logo } from "../../components/Logo";
import { useToast } from "../../components/ui";
import { ROLE_INFO, useAccount } from "../../data/account";
import { api, type Me, type Role } from "../../lib/api";
import { normEmail, normName, normPhone, passwordRules, ROLES } from "../../lib/validation";
import { apiErrors, BankForm, describedBy, Field, focusFirstError, FormError, PasswordChecklist, PhotoField, SsnForm, TestDataBanner, type Errors } from "./parts";
import "./account.css";

type Step = "account" | "identity" | "photo" | "bank";
const STEPS: Record<Role, Step[]> = { elder: ["account", "identity", "photo"], caregiver: ["account", "identity", "photo"], guardian: ["account", "identity", "photo", "bank"] };
const STEP_LABEL: Record<Step, string> = { account: "Account", identity: "Identity", photo: "Photo", bank: "Bank account" };
const ICON = { elder: User, caregiver: HeartHandshake, guardian: Scale };

/** Typed details survive "Change role" (CC-172). Kept in memory only — never the password. */
const draft = { firstName: "", lastName: "", phone: "", email: "" };

export default function Join() {
  const { role } = useParams();
  if (!role) return <RolePicker />;
  if (!ROLES.includes(role as Role)) return <Navigate to="/app/join" replace />;
  return <Steps key={role} role={role as Role} />;
}

function RolePicker() {
  const nav = useNavigate();
  const { me, ready, available } = useAccount();
  if (ready && me) return <Navigate to={me.profileStatus === "complete" ? "/app/account" : `/app/join/${me.role}`} replace />;
  return (
    <main className="acct-shell">
      <Link to="/" className="welcome-back"><ArrowLeft size={18} /> Circle Care website</Link>
      <div className="acct-head">
        <Logo size={56} />
        <h1 className="t-lg balance">Create your Circle Care account</h1>
        <p className="lede balance">First, tell us who you are in the care circle.</p>
      </div>
      {!available && <p className="form-error" role="alert">Accounts aren't available on this copy of the site. You can still explore the demo.</p>}
      <div className="role-grid">
        {ROLES.map((r) => {
          const Icon = ICON[r];
          const i = ROLE_INFO[r];
          return (
            <button key={r} className="role-card" style={{ "--tone": i.tone, "--soft": i.soft } as React.CSSProperties} onClick={() => nav(`/app/join/${r}`)}>
              <span className="role-icon"><Icon size={28} /></span>
              <span className="role-text"><b>{i.title}</b><span>{i.line}</span></span>
              <ChevronRight size={22} className="role-chev" />
            </button>
          );
        })}
      </div>
      <div className="acct-foot">
        <p>Already have an account? <Link to="/app/login" className="link">Sign in</Link></p>
        <p className="small muted"><Link to="/app" className="link">Explore the demo instead</Link> — no account needed, nothing is saved.</p>
      </div>
    </main>
  );
}

function Steps({ role }: { role: Role }) {
  const nav = useNavigate();
  const toast = useToast();
  const { me, setMe, ready } = useAccount();
  const steps = STEPS[role];
  const info = ROLE_INFO[role];
  const [step, setStep] = useState<Step>("account");
  const headRef = useRef<HTMLHeadingElement>(null);

  // Signed in already: resume at the first unfinished step.
  useEffect(() => {
    if (!ready || !me) return;
    if (me.role !== role) { nav(`/app/join/${me.role}`, { replace: true }); return; }
    if (step === "account") setStep(me.missing.includes("ssn") ? "identity" : me.missing.includes("bank_account") ? "bank" : "photo");
  }, [ready, me, role, nav, step]);

  useEffect(() => { headRef.current?.focus(); }, [step]);

  const finish = (m: Me) => {
    setMe(m);
    toast(m.profileStatus === "complete" ? "Your account is ready" : "Saved");
    nav("/app/account");
  };
  const next = (m: Me) => {
    setMe(m);
    const i = steps.indexOf(step);
    if (i < steps.length - 1) setStep(steps[i + 1]);
    else finish(m);
  };

  return (
    <main className="acct-shell">
      <div className="acct-topbar">
        {step === "account" ? <Link to="/app/join" className="welcome-back"><ArrowLeft size={18} /> Change role</Link> : <span />}
        <span className="badge" style={{ background: info.soft, color: "var(--ink)" }}>{info.label}</span>
      </div>
      <ol className="steps" aria-label={`Step ${steps.indexOf(step) + 1} of ${steps.length}`}>
        {steps.map((s, i) => {
          const at = steps.indexOf(step);
          return <li key={s} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}><span>{i < at ? <Check size={14} /> : i + 1}</span>{STEP_LABEL[s]}</li>;
        })}
      </ol>
      <section className="acct-card panel">
        <h1 ref={headRef} tabIndex={-1} className="t-md">
          {step === "account" && "Create your account"}
          {step === "identity" && "Verify your identity"}
          {step === "photo" && "Add a photo"}
          {step === "bank" && "Add your bank account"}
        </h1>
        {step === "account" && <AccountStep role={role} onDone={(m) => next(m)} />}
        {step === "identity" && me && (
          <>
            <p className="muted">Every member of a care circle verifies their identity. This keeps Maggie's circle limited to real, known people.</p>
            <TestDataBanner show={["ssn"]} />
            <SsnForm me={me} onSaved={next} submitLabel="Continue" />
          </>
        )}
        {step === "photo" && me && (
          <>
            <p className="muted">A photo helps everyone — especially the elder — recognise who's who. You can skip this.</p>
            <PhotoField me={me} onSaved={next} onSkip={() => next(me)} />
          </>
        )}
        {step === "bank" && me && (
          <>
            <p className="muted">As the legal guardian you pay for care. A bank account is required for ACH transfers — there's no platform fee. You can add credit or debit cards later in My account.</p>
            <TestDataBanner show={["bank"]} />
            <BankForm me={me} submitLabel="Save and finish" onSaved={async () => { const r = await api<{ me: Me }>("/api/me"); finish(r.me); }} />
          </>
        )}
        {step !== "account" && step !== "bank" && <p className="hint center">Your role can't be changed after the account is created. Contact support if it's wrong.</p>}
      </section>
    </main>
  );
}

function AccountStep({ role, onDone }: { role: Role; onDone: (m: Me) => void }) {
  const [f, setF] = useState({ ...draft, password: "", confirm: "", acceptTerms: false });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF({ ...f, [k]: v });
    if (k in draft) (draft as Record<string, string>)[k] = v as string;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {
      firstName: normName(f.firstName).error,
      lastName: normName(f.lastName).error,
      phone: normPhone(f.phone).error,
      email: normEmail(f.email).error,
      password: passwordRules(f.password, f.email).find((r) => !r.ok)?.label,
      confirm: f.confirm !== f.password ? "Passwords don't match" : undefined,
      acceptTerms: f.acceptTerms ? undefined : "Please agree to the Terms and Privacy Notice to continue",
    };
    setErrors(errs); setMessage(undefined);
    if (Object.values(errs).some(Boolean)) { focusFirstError(ref.current, errs); return; }
    setBusy(true);
    try {
      await api("/api/auth/signup", { body: { role, firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email, password: f.password, acceptTerms: true } });
      const r = await api<{ me: Me }>("/api/me");
      Object.assign(draft, { firstName: "", lastName: "", phone: "", email: "" });
      onDone(r.me);
    } catch (err) {
      const x = apiErrors(err);
      setErrors(x.errors); setMessage(x.message);
      focusFirstError(ref.current, x.errors);
    } finally { setBusy(false); }
  };

  const text = (k: "firstName" | "lastName" | "phone" | "email", label: string, props: React.InputHTMLAttributes<HTMLInputElement>, hint?: string) => (
    <Field id={`su-${k}`} label={label} error={errors[k]} hint={hint}>
      <input id={`su-${k}`} name={k} className="input" value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={describedBy(`su-${k}`, errors[k], !!hint)} required {...props} />
    </Field>
  );

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <div className="grid-2">
        {text("firstName", "First name", { autoComplete: "given-name" })}
        {text("lastName", "Last name", { autoComplete: "family-name" })}
      </div>
      {text("phone", "Contact number", { type: "tel", inputMode: "tel", autoComplete: "tel-national", placeholder: "(415) 555-0123" })}
      {text("email", "Email", { type: "email", autoComplete: "email", placeholder: "you@example.com" }, "You'll use this to sign in.")}
      <Field id="su-password" label="Password" error={errors.password}>
        <input id="su-password" name="password" className="input" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!errors.password} aria-describedby="su-pw-rules" required />
      </Field>
      <div id="su-pw-rules"><PasswordChecklist password={f.password} email={f.email} /></div>
      <Field id="su-confirm" label="Confirm password" error={errors.confirm}>
        <input id="su-confirm" name="confirm" className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} aria-describedby={describedBy("su-confirm", errors.confirm)} required />
      </Field>
      <div className={`field${errors.acceptTerms ? " has-error" : ""}`}>
        <label className="row check-row" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" name="acceptTerms" checked={f.acceptTerms} onChange={set("acceptTerms")} aria-invalid={!!errors.acceptTerms} aria-describedby={errors.acceptTerms ? "su-terms-err" : undefined} />
          <span className="small">I agree to the <Link to="/privacy" target="_blank" className="link">Terms and Privacy Notice</Link>, including how health information is protected under HIPAA and how my identity and payment details are encrypted.</span>
        </label>
        {errors.acceptTerms && <span id="su-terms-err" className="field-error" role="alert">{errors.acceptTerms}</span>}
      </div>
      <button className="btn lg block" disabled={busy}>{busy ? "Creating your account…" : "Create account"}</button>
    </form>
  );
}
