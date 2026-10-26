// My account (CC-176 – CC-188): profile, photo, identity, payments (guardian), security.

import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, CreditCard, Landmark, LogOut, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Logo } from "../../components/Logo";
import { useToast } from "../../components/ui";
import { ROLE_INFO, useAccount } from "../../data/account";
import { useStore } from "../../data/store";
import { api, type ActivityEvent, type Me, type PaymentMethods } from "../../lib/api";
import { formatPhone, normEmail, normName, normPhone } from "../../lib/validation";
import { accountTypeLabel, apiErrors, BankForm, CardForm, describedBy, Field, focusFirstError, FormError, MaskedSsn, MeAvatar, PhotoField, SsnForm, TestDataBanner, type Errors } from "./parts";
import "./account.css";

export default function MyAccount() {
  const { me, ready, available } = useAccount();
  if (!ready) return <main className="acct-shell"><p className="muted" role="status">Loading your account…</p></main>;
  if (!available) return <Navigate to="/app" replace />;
  if (!me) return <Navigate to="/app/login" replace />;
  return <AccountPage me={me} />;
}

function AccountPage({ me }: { me: Me }) {
  const nav = useNavigate();
  const toast = useToast();
  const { setMe, signOut } = useAccount();
  const { actions } = useStore();
  const info = ROLE_INFO[me.role];

  return (
    <main className="acct-shell wide">
      <div className="acct-topbar">
        <Link to="/" className="lp-brand" aria-label="Circle Care home"><Logo size={24} /> Circle Care</Link>
        <button className="btn plain sm" onClick={async () => { nav("/"); await signOut(); toast("Signed out"); }}><LogOut size={16} /> Sign out</button>
      </div>

      <header className="acct-hero">
        <MeAvatar me={me} size={104} />
        <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
          <h1 className="t-lg">{me.firstName} {me.lastName}</h1>
          <div className="row wrap">
            <span className="badge" style={{ background: info.soft, color: "var(--ink)" }}>{info.label}</span>
            {me.profileStatus === "complete"
              ? <span className="badge green"><CheckCircle2 size={14} /> Profile complete</span>
              : <span className="badge yellow"><AlertCircle size={14} /> Incomplete</span>}
          </div>
        </div>
      </header>

      {me.profileStatus === "incomplete" && (
        <section className="panel tint missing" aria-labelledby="missing-h">
          <h2 id="missing-h" className="t-sm">Finish setting up your account</h2>
          <ul>
            {me.missing.includes("ssn") && <li><a href="#identity" className="link">Add your Social Security number</a></li>}
            {me.missing.includes("bank_account") && <li><a href="#payments" className="link">Add a bank account</a> — required for the legal guardian</li>}
          </ul>
        </section>
      )}

      <div className="acct-grid">
        <div className="stack">
          <ProfileSection me={me} onSaved={(m) => { setMe(m); toast("Saved"); }} />
          <section className="panel" aria-labelledby="photo-h">
            <h2 id="photo-h" className="t-sm">Photo</h2>
            <PhotoField me={me} compact onSaved={(m) => { setMe(m); toast(m.hasPhoto ? "Photo saved" : "Photo removed"); }} />
          </section>
          <IdentitySection me={me} onSaved={(m) => { setMe(m); toast("Social Security number saved"); }} />
        </div>
        <div className="stack">
          {me.role === "guardian" && <PaymentsSection me={me} />}
          <section className="panel" aria-labelledby="circle-h">
            <h2 id="circle-h" className="t-sm">Your care circle</h2>
            <p className="muted small">Linking your account to a real care circle is the next step on the roadmap. Meanwhile you can explore the full {info.label.toLowerCase()} experience with demo data.</p>
            <button className="btn secondary" onClick={() => { actions.signIn(me.role); nav(`/app/${me.role}`); }}>Explore the {info.label.toLowerCase()} app <ArrowRight size={16} /></button>
          </section>
          <SecuritySection />
        </div>
      </div>
    </main>
  );
}

function ProfileSection({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  const [f, setF] = useState({ firstName: me.firstName, lastName: me.lastName, phone: formatPhone(me.phone), email: me.email });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const dirty = f.firstName !== me.firstName || f.lastName !== me.lastName || normPhone(f.phone).value !== me.phone || f.email.trim().toLowerCase() !== me.email;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = { firstName: normName(f.firstName).error, lastName: normName(f.lastName).error, phone: normPhone(f.phone).error, email: normEmail(f.email).error };
    setErrors(errs); setMessage(undefined);
    if (Object.values(errs).some(Boolean)) { focusFirstError(ref.current, errs); return; }
    setBusy(true);
    try {
      const r = await api<{ me: Me }>("/api/me", { method: "PATCH", body: f });
      setF({ firstName: r.me.firstName, lastName: r.me.lastName, phone: formatPhone(r.me.phone), email: r.me.email });
      onSaved(r.me);
    } catch (err) { const x = apiErrors(err); setErrors(x.errors); setMessage(x.message); focusFirstError(ref.current, x.errors); } finally { setBusy(false); }
  };

  const input = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Field id={`pf-${k}`} label={label} error={errors[k]}>
      <input id={`pf-${k}`} name={k} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!errors[k]} aria-describedby={describedBy(`pf-${k}`, errors[k])} {...props} />
    </Field>
  );

  return (
    <section className="panel" aria-labelledby="profile-h">
      <h2 id="profile-h" className="t-sm">Profile</h2>
      <form ref={ref} className="stack" onSubmit={submit} noValidate>
        <FormError message={message} />
        <div className="grid-2">{input("firstName", "First name", { autoComplete: "given-name" })}{input("lastName", "Last name", { autoComplete: "family-name" })}</div>
        {input("phone", "Contact number", { type: "tel", autoComplete: "tel-national" })}
        {input("email", "Contact email", { type: "email", autoComplete: "email" })}
        <p className="hint">You sign in with {me.loginEmail}.</p>
        <button className="btn" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </section>
  );
}

function IdentitySection({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  const [editing, setEditing] = useState(!me.ssnLast4);
  return (
    <section id="identity" className="panel" aria-labelledby="identity-h">
      <h2 id="identity-h" className="t-sm row" style={{ "--gap": "8px" } as React.CSSProperties}><ShieldCheck size={20} /> Identity</h2>
      <div className="kv"><span>Social Security number</span><b><MaskedSsn last4={me.ssnLast4} /></b></div>
      <p className="hint">Encrypted with AES-256. Circle Care staff and other members of the circle can never see it in full.</p>
      {editing ? (
        <>
          <TestDataBanner show={["ssn"]} />
          <SsnForm me={me} submitLabel={me.ssnLast4 ? "Change number" : "Save"} onSaved={(m) => { setEditing(false); onSaved(m); }} />
          {me.ssnLast4 && <button className="btn plain" onClick={() => setEditing(false)}>Cancel</button>}
        </>
      ) : <button className="btn plain" onClick={() => setEditing(true)}>Change</button>}
    </section>
  );
}

function PaymentsSection({ me }: { me: Me }) {
  const toast = useToast();
  const { refresh } = useAccount();
  const [pm, setPm] = useState<PaymentMethods | null>(null);
  const [mode, setMode] = useState<"none" | "bank" | "card">("none");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => { api<PaymentMethods>("/api/me/payment-methods").then(setPm).catch((e) => setError(apiErrors(e).message)); }, []);

  const act = async (fn: () => Promise<PaymentMethods>, msg: (r: PaymentMethods) => string) => {
    setError(undefined);
    try { const r = await fn(); setPm(r); toast(msg(r)); } catch (e) { setError(apiErrors(e).message); }
  };

  return (
    <section id="payments" className="panel" aria-labelledby="pay-h">
      <h2 id="pay-h" className="t-sm">Payments</h2>
      <p className="muted small">Cards are your primary way to pay. Your bank account is used for ACH transfers, with no platform fee.</p>
      <FormError message={error} />
      {!pm ? <p className="muted" role="status">Loading…</p> : (
        <div className="stack">
          <h3 className="pm-h"><Landmark size={18} /> Bank account <span className="badge">Required</span></h3>
          {pm.bankAccount ? (
            <div className="pm-card">
              <div><b>{pm.bankAccount.bankName}</b> · {accountTypeLabel(pm.bankAccount.accountType)} <span className="tnum">•••• {pm.bankAccount.accountLast4}</span><div className="small muted">Routing ••••• {pm.bankAccount.routingLast4} · ACH · <b>No platform fee</b></div></div>
              {mode !== "bank" && <button className="btn plain sm" onClick={() => setMode("bank")}>Replace</button>}
            </div>
          ) : <p className="missing-inline">No bank account yet — add one to complete your account.</p>}
          {(mode === "bank" || !pm.bankAccount) && (
            <>
              <TestDataBanner show={["bank"]} />
              <BankForm me={me} submitLabel={pm.bankAccount ? "Replace bank account" : "Save bank account"} onSaved={async (r) => { setPm(r); setMode("none"); toast("Bank account saved"); await refresh(); }} />
              {pm.bankAccount && <button className="btn plain" onClick={() => setMode("none")}>Cancel</button>}
            </>
          )}

          <h3 className="pm-h"><CreditCard size={18} /> Credit & debit cards</h3>
          {pm.cards.length === 0 && <p className="muted small">No cards yet.</p>}
          <ul className="pm-list">
            {pm.cards.map((c) => (
              <li key={c.id} className="pm-card">
                <div>
                  <b>{c.brandLabel}</b> {c.funding !== "unknown" && <span className="muted">{c.funding}</span>} <span className="tnum">•••• {c.last4}</span>
                  {c.isPrimary && <span className="badge blue" style={{ marginLeft: 8 }}><Star size={12} /> Primary</span>}
                  <div className="small muted">{c.holderName} · Expires {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)}</div>
                </div>
                <div className="row">
                  {!c.isPrimary && <button className="btn plain sm" onClick={() => act(() => api(`/api/me/payment-methods/cards/${c.id}/primary`, { method: "POST", body: {} }), () => `${c.brandLabel} •••• ${c.last4} is now primary`)}>Make primary</button>}
                  {confirmRemove === c.id ? (
                    <>
                      <button className="btn danger sm" onClick={() => { setConfirmRemove(null); void act(() => api(`/api/me/payment-methods/cards/${c.id}`, { method: "DELETE" }), (r) => r.promoted ? `Card removed. ${r.promoted.brandLabel} •••• ${r.promoted.last4} is now primary.` : "Card removed"); }}>Remove</button>
                      <button className="btn plain sm" onClick={() => setConfirmRemove(null)}>Keep</button>
                    </>
                  ) : <button className="btn ghost sm" aria-label={`Remove ${c.brandLabel} ending ${c.last4}`} onClick={() => setConfirmRemove(c.id)}><Trash2 size={16} /></button>}
                </div>
              </li>
            ))}
          </ul>
          {mode === "card" ? (
            <>
              <TestDataBanner show={["card"]} />
              <CardForm me={me} hasCards={pm.cards.length > 0} onCancel={() => setMode("none")} onSaved={(r) => { setPm(r); setMode("none"); toast("Card added"); }} />
            </>
          ) : (
            <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
              <button className="btn secondary" disabled={pm.cards.length >= pm.maxCards} onClick={() => setMode("card")}><CreditCard size={18} /> Add a card</button>
              {pm.cards.length >= pm.maxCards && <p className="hint">You can keep up to {pm.maxCards} cards. Remove one to add another.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SecuritySection() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const { me } = useAccount();
  useEffect(() => { api<{ events: ActivityEvent[] }>("/api/me/activity").then((r) => setEvents(r.events)).catch(() => setEvents([])); }, [me]);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <section className="panel" aria-labelledby="sec-h">
      <h2 id="sec-h" className="t-sm">Security · recent activity</h2>
      {!events ? <p className="muted" role="status">Loading…</p> : (
        <ul className="activity">
          {events.map((e, i) => <li key={i}><span>{e.text}</span><time dateTime={e.at} className="small muted">{fmt(e.at)}</time></li>)}
        </ul>
      )}
      <p className="hint">See something you didn't do? Sign out and contact support right away.</p>
    </section>
  );
}
