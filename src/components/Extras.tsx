import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Lock, PhoneCall, ArrowRight, X } from "lucide-react";
import { useStore } from "../data/store";
import { can, type Resource } from "../data/policy";
import { meId } from "../data/selectors";
import type { Persona } from "../data/types";
import { Sheet, useToast } from "./ui";
import { Logo } from "./Logo";
import { addNps, npsResponses } from "../lib/pilot";

/* ---------- CC-26: hide the screen in the app switcher ---------- */

/**
 * When the app goes to the background, a blank cover replaces the screen so the
 * app-switcher snapshot never shows health information.
 */
export function PrivacyShield() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    const blur = () => setHidden(true);
    const focus = () => setHidden(false);
    document.addEventListener("visibilitychange", on);
    window.addEventListener("pagehide", blur);
    window.addEventListener("pageshow", focus);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("pagehide", blur); window.removeEventListener("pageshow", focus); };
  }, []);
  if (!hidden) return null;
  return <div className="privacy-shield" aria-hidden="true"><Logo size={64} /></div>;
}

/* ---------- CC-19: read guard ---------- */

/** Renders a page only if the signed-in person may read it; otherwise explains why and logs the refusal. */
export function AccessGuard({ resource, children }: { resource: Resource; children: ReactNode }) {
  const { state, actions } = useStore();
  const me = meId(state.persona);
  const ok = can(state, me, "read", resource);
  useEffect(() => { if (!ok && state.persona) actions.denied(`read ${resource}`); }, [ok, resource, actions, state.persona]);
  if (ok) return <>{children}</>;
  const pro = state.persona === "caregiver";
  return (
    <div className="page narrow center" style={{ paddingTop: 56 }}>
      <Lock size={48} color="var(--blue)" style={{ margin: "0 auto" }} />
      <h1 className="t-lg" style={{ marginTop: 14 }}>{pro ? "Available during your shift" : "You don't have access to this"}</h1>
      <p className="lede balance" style={{ maxWidth: 460, margin: "10px auto 18px" }}>
        {pro ? "Caregivers see Maggie's care details only while checked in to a shift. Check in from Today to continue." : "Ask Sarah if you need it."}
      </p>
      {pro && <Link className="btn lg" to="/app/caregiver">Go to Today <ArrowRight size={18} /></Link>}
    </div>
  );
}

/* ---------- CC-75: first-run tour and setup help ---------- */

const TOURS: Record<Persona, { title: string; body: string }[]> = {
  elder: [
    { title: "Hello, Maggie", body: "Circle Care helps you remember your medicines and lets the people you choose know you're OK." },
    { title: "One tap each morning", body: "Tap “I'm OK” when you wake up. If you forget, we'll remind you before anyone is told." },
    { title: "Help is one press away", body: "Press SOS and hold. We call Sarah first, then the next person, until someone answers." },
    { title: "You're in charge", body: "The Privacy Center shows who can see your information. You can pause sharing at any time." },
  ],
  caregiver: [
    { title: "Welcome, Ana", body: "Circle Care shows you today's plan for Maggie: medicines, tasks and anything Sarah wants you to know." },
    { title: "Check in when you arrive", body: "Maggie's care details open when you check in and close again when you leave." },
    { title: "Hand off in a minute", body: "At the end of a shift we draft a summary from what you logged. Review it, add a note and send." },
  ],
  guardian: [
    { title: "Welcome, Sarah", body: "Home shows how Maggie's day is going: check-in, medicines, visits and anything that needs you." },
    { title: "You decide the big things", body: "Changes to medicines, new people and shift swaps come to Approvals. Maggie sees every decision." },
    { title: "Quiet unless it matters", body: "We alert you only for missed doses, missed check-ins, late caregivers and SOS. A weekly digest covers the rest." },
  ],
};

export function WelcomeTour({ persona }: { persona: Persona }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [i, setI] = useState(0);
  if (state.settings.toured?.[persona]) return null;
  const steps = TOURS[persona];
  const last = i === steps.length - 1;
  const done = () => actions.toured(persona);
  return (
    <Sheet title="Getting started" onClose={done}>
      <div className="stack center" style={{ "--gap": "14px" } as CSSProperties}>
        <div style={{ display: "flex", justifyContent: "center" }}><Logo size={56} /></div>
        <h2 className="t-lg balance">{steps[i].title}</h2>
        <p className="lede balance">{steps[i].body}</p>
        <div className="row" style={{ justifyContent: "center", "--gap": "6px" } as CSSProperties} aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((_, k) => <span key={k} style={{ width: 8, height: 8, borderRadius: 4, background: k === i ? "var(--blue)" : "var(--line)" }} />)}
        </div>
        <button className="btn lg block" onClick={() => (last ? done() : setI(i + 1))}>{last ? "Start using Circle Care" : "Next"}</button>
        {last ? (
          <button className="btn block plain" onClick={() => { actions.requestSetupCall(); done(); toast("We'll call within one business day to help set up"); }}><PhoneCall size={18} /> I'd like a free setup call</button>
        ) : (
          <button className="btn block plain" onClick={done}>Skip</button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- CC-76: in-app feedback (NPS) ---------- */

/** Shown after a person's second sign-in, once. Responses are kept apart from health data and scrubbed of health terms. */
export function NpsCard({ persona, force, onDone }: { persona: Persona; force?: boolean; onDone?: () => void }) {
  const { state } = useStore();
  const toast = useToast();
  const me = meId(persona);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(`cc-nps-dismissed-${persona}`) === "1"; } catch { return false; }
  });
  const signIns = state.audit.filter((a) => a.actorId === me && a.action === "signed in").length;
  const answered = npsResponses().some((r) => r.persona === persona);
  if (!force && (dismissed || answered || signIns < 2)) return null;
  const close = () => {
    try { sessionStorage.setItem(`cc-nps-dismissed-${persona}`, "1"); } catch { /* ignore */ }
    setDismissed(true);
    onDone?.();
  };
  const who = persona === "elder" ? "a friend" : "a friend or colleague";
  return (
    <section className="panel stack nps" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="nps-q">
      <div className="row between">
        <b id="nps-q">How likely are you to recommend Circle Care to {who}?</b>
        <button className="btn plain sm" style={{ width: 34, padding: 0 }} onClick={close} aria-label="Not now"><X size={18} /></button>
      </div>
      <div className="nps-scale" role="radiogroup" aria-labelledby="nps-q">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} role="radio" aria-checked={score === n} className={score === n ? "on" : ""} onClick={() => setScore(n)}>{n}</button>
        ))}
      </div>
      <div className="row between tiny"><span>Not likely</span><span>Very likely</span></div>
      {score !== null && (
        <>
          <label className="field"><span>What's the main reason? (optional)</span><textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Please don't include health details" /></label>
          <button className="btn" onClick={() => { addNps({ persona, score, comment: comment.trim() || undefined }); toast("Thank you — this helps us improve"); close(); }}>Send feedback</button>
        </>
      )}
      <p className="tiny">Your answer is stored without your name and kept separate from Maggie's care information.</p>
    </section>
  );
}
