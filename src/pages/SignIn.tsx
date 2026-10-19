import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ScanFace, Check, ArrowLeft, Lock } from "lucide-react";
import { useStore } from "../data/store";
import { member, meId } from "../data/selectors";
import { Avatar } from "../components/ui";
import type { Persona } from "../data/types";
import Consent from "./elder/Consent";
import "./welcome.css";

/** Each person gets a fresh sign-in screen (no state carried over between people). */
export default function SignInRoute() {
  const { persona = "guardian" } = useParams();
  return <SignIn key={persona} p={persona as Persona} />;
}

/** CC-11/12/13: sign in, MFA, elder-friendly biometric sign in, lockout after 5 failed attempts. */
function SignIn({ p }: { p: Persona }) {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const me = member(state, meId(p));
  const [stage, setStage] = useState<"creds" | "mfa" | "face" | "consent">(p === "elder" ? "face" : "creds");
  const [scan, setScan] = useState<"idle" | "scanning" | "ok">("idle");
  const [code, setCode] = useState("");
  const [fails, setFails] = useState(0);
  const [error, setError] = useState("");
  const locked = fails >= 5;

  const finish = () => {
    if (p === "elder" && !state.settings.consent) { setStage("consent"); return; }
    actions.signIn(p);
    nav(`/app/${p}`);
  };

  if (stage === "consent") return <Consent onDone={() => { actions.signIn("elder"); nav("/app/elder"); }} />;

  return (
    <main className="auth">
      <div className="auth-card">
        <Link to="/app" className="row" style={{ alignSelf: "flex-start", fontSize: 15 }}><ArrowLeft size={18} /> Back</Link>
        <div style={{ display: "grid", placeItems: "center" }}><Avatar m={me} size={84} /></div>
        <div>
          <h1 className="t-lg">Hi, {me?.short}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{p === "elder" ? "Sign in with your face — no password needed." : stage === "mfa" ? "Enter the code we sent to your phone." : "Sign in to Maggie's care circle."}</p>
        </div>

        {stage === "face" && (
          <>
            <div className={`auth-face ${scan === "scanning" ? "scanning" : scan === "ok" ? "ok" : ""}`} aria-live="polite">
              {scan === "ok" ? <Check size={56} /> : <ScanFace size={56} />}
              <span className="sr-only">{scan === "scanning" ? "Looking for your face" : scan === "ok" ? "Signed in" : ""}</span>
            </div>
            <button className="btn xl block" style={{ background: "var(--elder)" }} disabled={scan !== "idle"} onClick={() => {
              setScan("scanning");
              setTimeout(() => setScan("ok"), 1100);
              setTimeout(finish, 1700);
            }}>{scan === "idle" ? "Sign in with Face ID" : scan === "scanning" ? "Looking…" : "Welcome back"}</button>
            <p className="hint">Lost your phone? Sarah can help you sign in on a new one — she'll need to confirm it's you.</p>
          </>
        )}

        {stage === "creds" && (
          <form className="stack" style={{ textAlign: "left" }} onSubmit={(e) => { e.preventDefault(); setStage("mfa"); }}>
            <div className="field"><label htmlFor="si-email">Email</label><input id="si-email" className="input" defaultValue={`${me?.short.toLowerCase()}@example.com`} autoComplete="username" /></div>
            <div className="field"><label htmlFor="si-pw">Password</label><input id="si-pw" className="input" type="password" defaultValue="demo-password-2026" autoComplete="current-password" /></div>
            <button className="btn lg block">Continue</button>
            <p className="hint center">New device detected — we'll ask for a second step to keep Maggie's information safe.</p>
          </form>
        )}

        {stage === "mfa" && (
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            if (locked) return;
            if (code === "482913") finish();
            else { setFails(fails + 1); setError(fails + 1 >= 5 ? "" : `That code didn't match. ${5 - fails - 1} tries left.`); setCode(""); }
          }}>
            {locked ? (
              <div className="panel tint" style={{ background: "var(--red-soft)" }}>
                <Lock size={28} color="#d70015" />
                <p style={{ marginTop: 8, fontWeight: 600 }}>Account locked for 15 minutes</p>
                <p className="small muted">After 5 incorrect codes we lock sign-in and let {me?.short} know by email.</p>
                <button type="button" className="link" style={{ marginTop: 10 }} onClick={() => { setFails(0); setError(""); }}>Reset (demo)</button>
              </div>
            ) : (
              <>
                <input className="input otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="6-digit code" autoComplete="one-time-code" autoFocus aria-invalid={!!error} aria-describedby="mfa-err" />
                {error && <p id="mfa-err" className="small" style={{ color: "#d70015" }}>{error}</p>}
                <p className="hint">Sent to •••• {me?.phone.slice(-4)}. Demo code: <button type="button" className="link" onClick={() => setCode("482913")}>482913</button></p>
                <button className="btn lg block" disabled={code.length !== 6}>Sign in</button>
              </>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
