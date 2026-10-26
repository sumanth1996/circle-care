// Building blocks for sign-up and My account (CC-172 – CC-188).

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Camera, Check, CreditCard, Eye, EyeOff, FlaskConical, Landmark, Trash2, X } from "lucide-react";
import { useAccount } from "../../data/account";
import { api, ApiError, type Me, type PaymentMethods } from "../../lib/api";
import {
  BRAND_LABEL, cardBrand, checkBank, checkCard, checkSsn, formatCardInput, formatSsnInput, maskSsn, passwordRules, type BankInput, type CardInput,
} from "../../lib/validation";

/* ---------------- Form plumbing ---------------- */

export type Errors = Record<string, string | undefined>;

/** Moves focus to the first field with an error (CC-173). */
export function focusFirstError(form: HTMLFormElement | null, errors: Errors) {
  const first = Object.keys(errors).find((k) => errors[k]);
  if (!first || !form) return;
  const el = form.querySelector<HTMLElement>(`[name="${first}"]`);
  el?.focus();
}

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span id={`${id}-err`} className="field-error" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="hint">{hint}</span> : null}
    </div>
  );
}

export const describedBy = (id: string, error?: string, hint?: boolean) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="form-error" role="alert"><AlertTriangle size={18} /> <span>{message}</span></div>;
}

export function apiErrors(e: unknown): { errors: Errors; message?: string } {
  if (e instanceof ApiError) {
    const errors: Errors = { ...(e.fields ?? {}) };
    if (e.field && !errors[e.field]) errors[e.field] = e.message;
    return { errors, message: e.field ? undefined : e.message };
  }
  return { errors: {}, message: "Something went wrong. Please try again." };
}

/* ---------------- Test environment banner (CC-182) ---------------- */

export function TestDataBanner({ show = ["ssn", "bank", "card"] }: { show?: ("ssn" | "bank" | "card")[] }) {
  const { config } = useAccount();
  if (!config?.testData || !config.testValues) return null;
  const t = config.testValues;
  return (
    <aside className="test-banner" aria-label="Test environment">
      <p className="row" style={{ "--gap": "8px" } as React.CSSProperties}><FlaskConical size={18} /> <b>Test environment — use test data only.</b></p>
      <p className="small">Real Social Security numbers, bank accounts and cards are blocked here and never stored.</p>
      <ul className="small">
        {show.includes("ssn") && <li>SSN: any number starting with 9, e.g. <code>{t.ssn}</code></li>}
        {show.includes("bank") && <li>Routing <code>{t.routingNumber}</code> · Account <code>{t.accountNumber}</code> (any number starting 000)</li>}
        {show.includes("card") && <li>Cards: {t.cards.map((c, i) => <span key={c.number}><code>{formatCardInput(c.number)}</code> {c.label}{i < t.cards.length - 1 ? " · " : ""}</span>)} — any future expiry, any CVC</li>}
      </ul>
    </aside>
  );
}

/* ---------------- Password checklist (CC-173) ---------------- */

export function PasswordChecklist({ password, email }: { password: string; email: string }) {
  const rules = passwordRules(password, email);
  return (
    <ul className="pw-rules" aria-label="Password rules">
      {rules.map((r) => (
        <li key={r.id} className={r.ok ? "ok" : ""}>
          {r.ok ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />} {r.label}
          <span className="sr-only">{r.ok ? " — met" : " — not met yet"}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Avatar with the user's own photo (CC-179) ---------------- */

export function MeAvatar({ me, size = 96 }: { me: Pick<Me, "firstName" | "lastName" | "hasPhoto">; size?: number }) {
  const { photoKey } = useAccount();
  const initials = `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase();
  return me.hasPhoto
    ? <img className="me-avatar" src={`/api/me/photo?v=${photoKey}`} alt={`${me.firstName} ${me.lastName}`} width={size} height={size} style={{ width: size, height: size }} />
    : <span className="me-avatar initials" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-label={`${me.firstName} ${me.lastName}`} role="img">{initials}</span>;
}

/* ---------------- Masked SSN (CC-181) ---------------- */

export function MaskedSsn({ last4 }: { last4: string | null }) {
  if (!last4) return <span className="muted">Not added</span>;
  return <span className="tnum" aria-label={`Social Security number ending in ${last4.split("").join(" ")}`}>{maskSsn(last4)}</span>;
}

/* ---------------- SSN form (CC-180) ---------------- */

export function SsnForm({ me, onSaved, submitLabel = "Save" }: { me: Me; onSaved: (m: Me) => void; submitLabel?: string }) {
  const { config } = useAccount();
  const [ssn, setSsn] = useState("");
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const changing = !!me.ssnLast4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = checkSsn(ssn, config?.testData ?? true);
    const errs: Errors = { ssn: local.error, password: changing && !password ? "Enter your password to change your Social Security number." : undefined };
    setErrors(errs);
    setMessage(undefined);
    if (errs.ssn || errs.password) { focusFirstError(ref.current, errs); return; }
    setBusy(true);
    try {
      const r = await api<{ me: Me }>("/api/me/ssn", { method: "PUT", body: { ssn, password: changing ? password : undefined } });
      setSsn(""); setPassword("");
      onSaved(r.me);
    } catch (err) {
      const x = apiErrors(err);
      setErrors(x.errors); setMessage(x.message);
      focusFirstError(ref.current, x.errors);
    } finally { setBusy(false); }
  };

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field id="ssn" label={changing ? "New Social Security number" : "Social Security number"} error={errors.ssn} hint="We use it only to verify your identity. It's encrypted, and we'll only ever show the last four digits.">
        <div className="input-with-btn">
          <input id="ssn" name="ssn" className="input tnum" type={show ? "text" : "password"} inputMode="numeric" autoComplete="off" spellCheck={false}
            placeholder="###-##-####" value={ssn} onChange={(e) => setSsn(formatSsnInput(e.target.value))} maxLength={11}
            aria-invalid={!!errors.ssn} aria-describedby={describedBy("ssn", errors.ssn, true)} required />
          <button type="button" className="btn plain sm" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Hide Social Security number" : "Show Social Security number"}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </Field>
      {changing && (
        <Field id="ssn-pw" label="Your password" error={errors.password} hint="For your security, changing this needs your password.">
          <input id="ssn-pw" name="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={describedBy("ssn-pw", errors.password, true)} />
        </Field>
      )}
      <button className="btn lg block" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

/* ---------------- Photo picker (CC-179) ---------------- */

const MAX_INPUT = 10 * 1024 * 1024;

/** Center-crops to a square, scales to ≤ 512 px and re-encodes as JPEG — which drops EXIF/GPS data. */
async function preparePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(512, side);
    const c = document.createElement("canvas");
    c.width = out; c.height = out;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(url); }
}

export function PhotoField({ me, onSaved, onSkip, compact }: { me: Me; onSaved: (m: Me) => void; onSkip?: () => void; compact?: boolean }) {
  const { bumpPhoto } = useAccount();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputId = useId();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = async (file?: File) => {
    setError(undefined);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP photo."); return; }
    if (file.size > MAX_INPUT) { setError("That photo is over 10 MB. Choose a smaller one."); return; }
    try {
      const b = await preparePhoto(file);
      setBlob(b);
      setPreview(URL.createObjectURL(b));
    } catch { setError("We couldn't read that photo. Try another one."); }
  };

  const save = async () => {
    if (!blob) return;
    setBusy(true);
    try {
      const r = await api<{ me: Me }>("/api/me/photo", { method: "PUT", raw: blob, rawType: "image/jpeg" });
      bumpPhoto(); setBlob(null); setPreview(undefined);
      onSaved(r.me);
    } catch (e) { setError(apiErrors(e).message ?? apiErrors(e).errors.photo); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const r = await api<{ me: Me }>("/api/me/photo", { method: "DELETE" });
      bumpPhoto(); setConfirmRemove(false);
      onSaved(r.me);
    } catch (e) { setError(apiErrors(e).message); } finally { setBusy(false); }
  };

  return (
    <div className={`photo-field${compact ? " compact" : ""}`}>
      <div className="photo-preview">
        {preview ? <img src={preview} alt="Preview of your new photo" className="me-avatar" width={compact ? 88 : 132} height={compact ? 88 : 132} /> : <MeAvatar me={me} size={compact ? 88 : 132} />}
      </div>
      <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} aria-describedby={`${inputId}-hint`} />
        <div className="row wrap">
          <label htmlFor={inputId} className="btn secondary" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.getElementById(inputId)?.click(); } }}>
            <Camera size={18} /> {me.hasPhoto || preview ? "Choose a different photo" : "Choose a photo"}
          </label>
          {preview && <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save photo"}</button>}
          {!preview && me.hasPhoto && !confirmRemove && <button type="button" className="btn ghost" onClick={() => setConfirmRemove(true)}><Trash2 size={16} /> Remove photo</button>}
          {confirmRemove && <span className="row"><span className="small">Remove your photo?</span><button type="button" className="btn danger sm" onClick={remove} disabled={busy}>Remove</button><button type="button" className="btn plain sm" onClick={() => setConfirmRemove(false)}>Keep</button></span>}
        </div>
        <span id={`${inputId}-hint`} className="hint">JPEG, PNG or WebP. We crop it to a square and remove location data before it's uploaded.</span>
        {error && <span className="field-error" role="alert">{error}</span>}
        {onSkip && !preview && <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={onSkip}>Skip for now</button>}
      </div>
    </div>
  );
}

/* ---------------- Bank account (CC-186) ---------------- */

export function BankForm({ me, onSaved, submitLabel = "Save bank account" }: { me: Me; onSaved: (pm: PaymentMethods) => void; submitLabel?: string }) {
  const { config } = useAccount();
  const [f, setF] = useState<BankInput & { confirm: string }>({ bankName: "", holderName: `${me.firstName} ${me.lastName}`, routingNumber: "", accountNumber: "", confirm: "", accountType: "checking" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "routingNumber" || k === "accountNumber" || k === "confirm" ? e.target.value.replace(/\D/g, "").slice(0, 17) : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: errs } = checkBank(f, config?.testData ?? true);
    const all: Errors = { ...errs, confirm: f.confirm !== f.accountNumber ? "Account numbers don't match" : undefined };
    setErrors(all); setMessage(undefined);
    if (Object.values(all).some(Boolean)) { focusFirstError(ref.current, all); return; }
    setBusy(true);
    try {
      // Numbers go to the vault only; the Circle Care API receives a token.
      const tok = await api<{ token: string }>("/vault/v1/bank-accounts", { body: { bankName: f.bankName, holderName: f.holderName, routingNumber: f.routingNumber, accountNumber: f.accountNumber, accountType: f.accountType } });
      const pm = await api<PaymentMethods>("/api/me/payment-methods/bank-account", { body: { token: tok.token } });
      onSaved(pm);
    } catch (err) {
      const x = apiErrors(err); setErrors(x.errors); setMessage(x.message); focusFirstError(ref.current, x.errors);
    } finally { setBusy(false); }
  };

  const input = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field id={`bank-${k}`} label={label} error={errors[k]} hint={hint}>
      <input id={`bank-${k}`} name={k} className="input" value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={describedBy(`bank-${k}`, errors[k], !!hint)} {...props} />
    </Field>
  );

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      {input("bankName", "Bank name", { autoComplete: "off", placeholder: "e.g. Bank of America" })}
      {input("holderName", "Name on the account", { autoComplete: "name" })}
      <fieldset className="field">
        <legend className="label">Account type</legend>
        <div className="segmented" role="group" aria-label="Account type">
          {(["checking", "savings"] as const).map((t) => <button type="button" key={t} aria-pressed={f.accountType === t} onClick={() => setF({ ...f, accountType: t })}>{t === "checking" ? "Checking" : "Savings"}</button>)}
        </div>
      </fieldset>
      {input("routingNumber", "Routing number", { inputMode: "numeric", autoComplete: "off", maxLength: 9 }, "The 9-digit number at the bottom left of a check.")}
      {input("accountNumber", "Account number", { inputMode: "numeric", autoComplete: "off", type: "password" })}
      {input("confirm", "Confirm account number", { inputMode: "numeric", autoComplete: "off", type: "password" })}
      <p className="hint row" style={{ "--gap": "6px" } as React.CSSProperties}><Landmark size={16} /> Used for ACH bank transfers — no platform fee. We keep only the last four digits.</p>
      <button className="btn lg block" disabled={busy}>{busy ? "Saving securely…" : submitLabel}</button>
    </form>
  );
}

/* ---------------- Card (CC-187) ---------------- */

export function CardForm({ me, hasCards, onSaved, onCancel }: { me: Me; hasCards: boolean; onSaved: (pm: PaymentMethods) => void; onCancel?: () => void }) {
  const { config } = useAccount();
  const [f, setF] = useState({ holderName: `${me.firstName} ${me.lastName}`, number: "", exp: "", cvc: "", postalCode: "", makePrimary: !hasCards });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const brand = cardBrand(f.number);
  const [mm, yy] = f.exp.split("/");
  const card: CardInput = { holderName: f.holderName, number: f.number, expMonth: Number(mm), expYear: Number(yy), cvc: f.cvc, postalCode: f.postalCode };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: errs } = checkCard(card, config?.testData ?? true);
    const mapped: Errors = { holderName: errs.holderName, number: errs.number, exp: errs.expMonth, cvc: errs.cvc, postalCode: errs.postalCode };
    setErrors(mapped); setMessage(undefined);
    if (Object.values(mapped).some(Boolean)) { focusFirstError(ref.current, mapped); return; }
    setBusy(true);
    try {
      // Card details go to the vault only — never to the Circle Care API (CC-187).
      const tok = await api<{ token: string }>("/vault/v1/cards", { body: card });
      const pm = await api<PaymentMethods>("/api/me/payment-methods/cards", { body: { token: tok.token, makePrimary: !hasCards || f.makePrimary } });
      onSaved(pm);
    } catch (err) {
      const x = apiErrors(err);
      const errs2 = { ...x.errors, exp: x.errors.expMonth ?? x.errors.expYear };
      setErrors(errs2); setMessage(x.message); focusFirstError(ref.current, errs2);
    } finally { setBusy(false); }
  };

  return (
    <form ref={ref} className="stack" onSubmit={submit} noValidate>
      <FormError message={message} />
      <Field id="card-name" label="Name on card" error={errors.holderName}>
        <input id="card-name" name="holderName" className="input" autoComplete="cc-name" value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} aria-invalid={!!errors.holderName} aria-describedby={describedBy("card-name", errors.holderName)} />
      </Field>
      <Field id="card-number" label="Card number" error={errors.number}>
        <div className="input-with-badge">
          <input id="card-number" name="number" className="input tnum" inputMode="numeric" autoComplete="cc-number" value={f.number} onChange={(e) => setF({ ...f, number: formatCardInput(e.target.value) })} aria-invalid={!!errors.number} aria-describedby={describedBy("card-number", errors.number)} />
          {brand !== "unknown" && <span className="badge blue" aria-live="polite">{BRAND_LABEL[brand]}</span>}
        </div>
      </Field>
      <div className="grid-3">
        <Field id="card-exp" label="Expiry (MM/YY)" error={errors.exp}>
          <input id="card-exp" name="exp" className="input tnum" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={5} value={f.exp}
            onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); setF({ ...f, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} aria-invalid={!!errors.exp} aria-describedby={describedBy("card-exp", errors.exp)} />
        </Field>
        <Field id="card-cvc" label="Security code" error={errors.cvc}>
          <input id="card-cvc" name="cvc" className="input tnum" inputMode="numeric" autoComplete="cc-csc" type="password" maxLength={4} value={f.cvc} onChange={(e) => setF({ ...f, cvc: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errors.cvc} aria-describedby={describedBy("card-cvc", errors.cvc)} />
        </Field>
        <Field id="card-zip" label="Billing ZIP" error={errors.postalCode}>
          <input id="card-zip" name="postalCode" className="input tnum" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errors.postalCode} aria-describedby={describedBy("card-zip", errors.postalCode)} />
        </Field>
      </div>
      {hasCards && (
        <label className="row check-row"><input type="checkbox" checked={f.makePrimary} onChange={(e) => setF({ ...f, makePrimary: e.target.checked })} /> Make this my primary payment method</label>
      )}
      <p className="hint row" style={{ "--gap": "6px" } as React.CSSProperties}><CreditCard size={16} /> Card details go straight to our payment processor. Circle Care never stores your card number or security code.</p>
      <div className="row">
        <button className="btn lg" disabled={busy}>{busy ? "Adding securely…" : "Add card"}</button>
        {onCancel && <button type="button" className="btn plain lg" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export const accountTypeLabel = (t: string) => (t === "savings" ? "Savings" : "Checking");
