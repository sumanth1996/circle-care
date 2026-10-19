import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { Photo, Sheet, useToast } from "../components/ui";
import { Logo } from "../components/Logo";
import type { Persona } from "../data/types";
import { useStore } from "../data/store";
import type { PhotoKey } from "../data/images";
import "./welcome.css";

const people: { p: Persona; name: string; role: string; photo: PhotoKey; tone: string; line: string }[] = [
  { p: "elder", name: "Maggie", role: "Elder", photo: "elder", tone: "var(--elder)", line: "See what's next, call family, or get help." },
  { p: "caregiver", name: "Ana", role: "Caregiver", photo: "caregiverTalk", tone: "var(--care)", line: "Today's shift, doses, tasks and hand-off." },
  { p: "guardian", name: "Sarah", role: "Legal guardian", photo: "family", tone: "var(--guard)", line: "Status at a glance, approvals and the week ahead." },
];

export default function Welcome() {
  const { state } = useStore();
  const nav = useNavigate();
  const [signup, setSignup] = useState(false);
  const go = (p: Persona) => nav(state.signedIn[p] ? `/app/${p}` : `/app/sign-in/${p}`);

  return (
    <main className="welcome">
      <Link to="/" className="welcome-back"><ArrowLeft size={18} /> Circle Care website</Link>
      <div className="welcome-head">
        <Logo size={64} />
        <h1 className="t-xl balance">Welcome to Circle Care</h1>
        <p className="lede balance">This demo has one care circle with three people in it. Pick who you'd like to be — you can switch anytime.</p>
      </div>
      <div className="who">
        {people.map((x) => (
          <button key={x.p} className="who-card" onClick={() => go(x.p)} style={{ "--tone": x.tone } as React.CSSProperties}>
            <Photo k={x.photo} w={700} className="who-img" eager />
            <span className="who-body">
              <span className="who-role">{x.role}</span>
              <span className="who-name">{x.name}</span>
              <span className="who-line">{x.line}</span>
            </span>
            <ChevronRight className="who-chev" size={22} />
          </button>
        ))}
      </div>
      <div className="welcome-foot">
        <p className="muted small"><ShieldCheck size={16} style={{ verticalAlign: "-3px" }} /> Fictional demo data, stored only in this browser.</p>
        <button className="link" onClick={() => setSignup(true)}>Start a new care circle</button>
      </div>
      {signup && <SignUp onClose={() => setSignup(false)} />}
    </main>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

/** CC-11 sign up · CC-15 create a care circle. Demo only: nothing is sent. */
function SignUp({ onClose }: { onClose: () => void }) {
  const { actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", contact: "", pw: "", agree: false, code: "", elder: "", role: "guardian" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const s = strength(form.pw);
  const weak = form.pw.length > 0 && s < 3;

  return (
    <Sheet title={["Create your account", "Verify it's you", "Create a care circle"][step]} onClose={onClose}>
      {step === 0 && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setStep(1); }}>
          <div className="field"><label htmlFor="su-name">Your name</label><input id="su-name" className="input" required value={form.name} onChange={set("name")} autoComplete="name" /></div>
          <div className="field"><label htmlFor="su-contact">Email or mobile number</label><input id="su-contact" className="input" required value={form.contact} onChange={set("contact")} autoComplete="email" /></div>
          <div className="field">
            <label htmlFor="su-pw">Password</label>
            <input id="su-pw" className="input" type="password" required value={form.pw} onChange={set("pw")} autoComplete="new-password" aria-describedby="pw-hint" />
            <div className="pw-meter" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={i < s ? `on s${s}` : ""} />)}</div>
            <span id="pw-hint" className="hint" style={weak ? { color: "#9a4f00" } : undefined}>
              {weak ? "Add more: use 10+ characters with upper and lower case, a number and a symbol." : "Use 10 or more characters with a mix of letters, numbers and symbols."}
            </span>
          </div>
          <label className="row" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" required checked={form.agree} onChange={set("agree")} style={{ width: 22, height: 22, marginTop: 2 }} />
            <span className="small">I've read the <b>privacy notice</b>: Circle Care only shares information with people the elder approves, and every access is logged.</span>
          </label>
          <button className="btn lg block" disabled={!form.agree || s < 3}>Continue</button>
        </form>
      )}
      {step === 1 && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
          <p className="muted">We sent a 6-digit code to <b>{form.contact || "you"}</b>.</p>
          <input className="input otp" inputMode="numeric" maxLength={6} pattern="\d{6}" required value={form.code} onChange={set("code")} aria-label="6-digit code" autoComplete="one-time-code" />
          <p className="hint">Demo code: <button type="button" className="link" onClick={() => setForm({ ...form, code: "482913" })}>482913</button></p>
          <button className="btn lg block" disabled={form.code.length !== 6}>Verify</button>
        </form>
      )}
      {step === 2 && (
        <form className="stack" onSubmit={(e) => {
          e.preventDefault();
          actions.signIn("guardian");
          toast(`${form.elder || "Your"}'s circle is ready`);
          onClose();
          nav("/app/guardian/circle");
        }}>
          <p className="muted">A care circle is built around one person. They'll be asked to confirm the circle and everyone in it.</p>
          <div className="field"><label htmlFor="su-elder">Who is this circle for?</label><input id="su-elder" className="input" required placeholder="e.g. Margaret Lee" value={form.elder} onChange={set("elder")} /></div>
          <div className="field">
            <label htmlFor="su-role">Your role</label>
            <select id="su-role" className="input" value={form.role} onChange={set("role")}>
              <option value="guardian">Legal guardian or power of attorney</option>
              <option value="family">Family caregiver</option>
              <option value="elder">It's for me</option>
            </select>
          </div>
          <p className="hint">For this demo, we'll open Sarah's example circle so you can explore with real-looking data.</p>
          <button className="btn lg block">Create circle</button>
        </form>
      )}
    </Sheet>
  );
}
