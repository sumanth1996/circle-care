// Set up two-step sign-in (CC-200). Guardians and caregivers are sent here
// until they finish; elders can come here from My account if they want it.

import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Logo } from "../../components/Logo";
import { useToast } from "../../components/ui";
import { useAccount } from "../../data/account";
import { TwoStepSetup } from "./security";
import "./account.css";

export default function TwoStep() {
  const nav = useNavigate();
  const toast = useToast();
  const { me, needsSetup, ready, available, refresh, signOut } = useAccount();
  if (!ready) return <main className="acct-shell"><p className="muted" role="status">Loading your account…</p></main>;
  if (!available) return <Navigate to="/app" replace />;
  if (!me && !needsSetup) return <Navigate to="/app/login" replace />;

  const required = !!needsSetup;
  return (
    <main className="acct-shell">
      <div className="acct-topbar">
        {required
          ? <button className="btn plain" onClick={async () => { await signOut(); nav("/"); }}>Sign out</button>
          : <Link to="/app/account" className="welcome-back"><ArrowLeft size={18} /> My account</Link>}
        <span />
      </div>
      <div className="acct-head">
        <Logo size={56} />
        <h1 className="t-lg">Two-step sign-in</h1>
      </div>
      <section className="acct-card panel">
        {me?.mfaEnrolled ? (
          <div className="stack">
            <p className="row" style={{ "--gap": "8px" } as React.CSSProperties}><CheckCircle2 size={20} color="#1a7f37" /> <b>Two-step sign-in is on for your account.</b></p>
            <Link to="/app/account" className="btn lg block">Back to my account</Link>
          </div>
        ) : (
          <TwoStepSetup required={required} onDone={async () => {
            const m = await refresh();
            toast("Two-step sign-in is on");
            nav(!m ? "/app/login" : m.profileStatus === "complete" ? "/app/account" : `/app/join/${m.role}`);
          }} />
        )}
      </section>
    </main>
  );
}
