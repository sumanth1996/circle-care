import { useNavigate } from "react-router-dom";
import { FastForward, Pill, Sun, Clock3, Siren, Lock, RotateCcw, Globe, Check, ShieldAlert, MessageSquareHeart, BarChart3, FileCheck2, Hourglass, HeartPulse, Droplets } from "lucide-react";
import { useStore } from "../data/store";
import { member, meId, clock } from "../data/selectors";
import type { Persona } from "../data/types";
import { Avatar, Sheet, useToast } from "./ui";
import { fmtTime } from "../lib/time";

const options: { p: Persona; role: string }[] = [
  { p: "elder", role: "Elder" },
  { p: "caregiver", role: "Caregiver" },
  { p: "guardian", role: "Legal guardian" },
];

/** Approved feature: Persona switcher demo mode. One tap between views, plus presenter controls. */
export default function PersonaSheet({ onClose }: { onClose: () => void }) {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const go = (p: Persona) => {
    onClose();
    if (!state.signedIn[p]) actions.signIn(p);
    actions.setPersona(p);
    nav(`/app/${p}`);
  };
  const run = (msg: string, fn: () => void) => { fn(); toast(msg); onClose(); };

  return (
    <Sheet title="Demo mode" onClose={onClose}>
      <div className="stack">
        <p className="muted small">Everyone below is fictional. Switch to see the same care circle through each person's eyes.</p>
        <div className="list">
          {options.map((o) => {
            const m = member(state, meId(o.p));
            const current = state.persona === o.p;
            return (
              <button key={o.p} className="list-row" onClick={() => go(o.p)} aria-current={current}>
                <Avatar m={m} size={48} />
                <span className="grow"><span className="list-title" style={{ display: "block" }}>{m?.name}</span><span className="list-sub">{o.role}</span></span>
                {current && <Check size={22} color="var(--blue)" />}
              </button>
            );
          })}
        </div>

        <h3 className="section-title" style={{ fontSize: 17 }}>Presenter controls</h3>
        <p className="tiny" style={{ marginTop: -10 }}>Demo time: {fmtTime(clock(state))}{state.clockOffsetMin ? ` (+${state.clockOffsetMin} min)` : ""}</p>
        <div className="list">
          <button className="list-row has-icon" onClick={() => run("Skipped ahead 30 minutes", () => actions.skipAhead(30))}><FastForward size={22} color="var(--blue)" /><span className="grow">Skip ahead 30 minutes</span></button>
          <button className="list-row has-icon" onClick={() => run("A dose is now 70 minutes late", () => actions.simulate("missed-dose"))}><Pill size={22} color="var(--blue)" /><span className="grow">Simulate a missed dose</span></button>
          <button className="list-row has-icon" onClick={() => run("Maggie missed today's check-in", () => actions.simulate("missed-checkin"))}><Sun size={22} color="var(--blue)" /><span className="grow">Simulate a missed check-in</span></button>
          <button className="list-row has-icon" onClick={() => run("Ana is running late", () => actions.simulate("late-caregiver"))}><Clock3 size={22} color="var(--blue)" /><span className="grow">Simulate a late caregiver</span></button>
          <button className="list-row has-icon" onClick={() => run("SOS sent from Maggie's phone", () => actions.sosStart())}><Siren size={22} color="var(--red)" /><span className="grow">Trigger SOS from Maggie</span></button>
          <button className="list-row has-icon" onClick={() => run("Ana's request is now 26 hours old", () => actions.simulate("old-request"))}><Hourglass size={22} color="var(--blue)" /><span className="grow">Simulate a request waiting a day</span></button>
          <button className="list-row has-icon" onClick={() => run("Maggie's watch sent a fast heart-rate reading", () => actions.simulate("heart-rate"))}><HeartPulse size={22} color="var(--red)" /><span className="grow">Simulate a sudden heart-rate change</span></button>
          <button className="list-row has-icon" onClick={() => run("Maggie's watch sent a low oxygen reading", () => actions.simulate("oxygen"))}><Droplets size={22} color="var(--blue)" /><span className="grow">Simulate a low blood-oxygen reading</span></button>
          <button className="list-row has-icon" onClick={() => run("James opened 9 records in a minute", () => actions.simulate("suspicious-access"))}><ShieldAlert size={22} color="var(--orange, #ff9f0a)" /><span className="grow">Simulate suspicious access</span></button>
          <button className="list-row has-icon" onClick={() => { onClose(); window.dispatchEvent(new Event("cc:lock")); }}><Lock size={22} color="var(--blue)" /><span className="grow">Lock the app now</span></button>
          <button className="list-row has-icon" onClick={() => { onClose(); window.dispatchEvent(new Event("cc:nps")); }}><MessageSquareHeart size={22} color="var(--blue)" /><span className="grow">Show the feedback survey</span></button>
        </div>
        <h3 className="section-title" style={{ fontSize: 17 }}>Behind the scenes</h3>
        <div className="list">
          <button className="list-row has-icon" onClick={() => { onClose(); nav("/app/review"); }}><FileCheck2 size={22} color="var(--blue)" /><span className="grow">Review team console</span></button>
          <button className="list-row has-icon" onClick={() => { onClose(); nav("/app/pilot"); }}><BarChart3 size={22} color="var(--blue)" /><span className="grow">Pilot dashboard</span></button>
        </div>
        <div className="list">
          <button className="list-row has-icon" onClick={() => { if (confirm("Reset the demo to its starting data?")) { actions.resetDemo(); onClose(); nav("/app"); } }}><RotateCcw size={22} color="var(--muted)" /><span className="grow">Reset demo</span></button>
          <button className="list-row has-icon" onClick={() => { onClose(); nav("/"); }}><Globe size={22} color="var(--muted)" /><span className="grow">Back to the website</span></button>
        </div>
      </div>
    </Sheet>
  );
}
