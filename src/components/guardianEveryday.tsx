import { useEffect, useState, type CSSProperties } from "react";
import { PackageCheck, PackagePlus, Truck, EyeOff, Utensils } from "lucide-react";
import type { Medication, State } from "../data/types";
import { useStore, useCan } from "../data/store";
import { pillsLeft, daysLeft, supplyState, refillPlan, scheduledRefill, sharedWeek, feelingOf, MEALS, dailyShared } from "../data/everyday";
import { Face } from "./everyday";
import { nameOf } from "../data/selectors";
import { Sheet, useToast } from "./ui";
import { fmtShortDay } from "../lib/time";
import "./everyday.css";

/* ---------------- CC-120 – CC-121: supply on the medicine card ---------------- */

export function SupplyRow({ med, state }: { med: Medication; state: State }) {
  const { actions } = useStore();
  const toast = useToast();
  const [count, setCount] = useState<string | null>(null);
  // Only show actions this person may take, so a refused change never looks like it worked.
  const canWrite = useCan("write", "supply");
  const entry = scheduledRefill(state, med);
  const left = pillsLeft(state, med);
  const days = daysLeft(state, med);
  const st = supplyState(state, med);
  const plan = refillPlan(state, med);
  const unit = med.dose.split(" ").slice(1).join(" ").replace(/s?$/, "s") || "pills";
  if (st === "untracked") {
    if (!canWrite) return null;
    return (
      <>
        <button className="btn sm plain" onClick={() => setCount("")}><PackagePlus size={15} /> Track pills on hand</button>
        {count !== null && <BottleSheet med={med} onClose={() => setCount(null)} onSave={(n) => { actions.recordRefill(med.id, n); setCount(null); toast(`${med.name}: ${n} on hand`); }} />}
      </>
    );
  }
  return (
    <div className={`supply ${st}`}>
      <div className="supply-top">
        <b>{st === "paused" ? "Paused" : `${days} ${days === 1 ? "day" : "days"} left`}</b>
        <span className="muted">{Number((left ?? 0).toFixed(1))} {unit} on hand{plan && st !== "paused" ? ` · runs out ${fmtShortDay(plan.runsOut)}` : ""}</span>
      </div>
      <div className="supply-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ((days ?? 0) / 30) * 100)}%` }} /></div>
      {st === "low" && <p className="small" style={{ color: "#9a4f00" }}>{entry ? `Refill on the Calendar for ${fmtShortDay(entry.date)}.` : "Not on the Calendar yet."}</p>}
      {st === "requested" && <p className="small" style={{ color: "var(--blue)" }}><Truck size={14} style={{ verticalAlign: "-2px" }} /> {nameOf(state, med.supply?.requestedBy)} asked {med.supply?.pharmacy ?? "the pharmacy"} for a refill.</p>}
      <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
        {canWrite && st === "low" && <button className="btn sm" onClick={() => { actions.requestRefill(med.id); toast(`Refill of ${med.name} requested`); }}><Truck size={15} /> Request refill</button>}
        {canWrite && <button className="btn sm secondary" onClick={() => setCount("")}><PackageCheck size={15} /> New bottle</button>}
      </div>
      {count !== null && <BottleSheet med={med} onClose={() => setCount(null)} onSave={(n) => { actions.recordRefill(med.id, n); setCount(null); toast(`${med.name}: ${n} on hand`); }} />}
    </div>
  );
}

function BottleSheet({ med, onClose, onSave }: { med: Medication; onClose: () => void; onSave: (n: number) => void }) {
  const [v, setV] = useState("30");
  const n = Number(v);
  const ok = Number.isInteger(n) && n > 0 && n <= 1000;
  return (
    <Sheet title={`New bottle of ${med.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(n); }}>
        <div className="field"><label htmlFor="bottle-n">How many are in the bottle?</label>
          <input id="bottle-n" className="input" inputMode="numeric" pattern="[0-9]*" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties} role="group" aria-label="Common bottle sizes">
          {[30, 60, 90].map((x) => <button key={x} type="button" className="btn sm secondary" aria-pressed={v === String(x)} onClick={() => setV(String(x))}>{x}</button>)}
        </div>
        <button className="btn lg block" disabled={!ok}>Save count</button>
        <p className="hint center">The count goes down by one each time a dose is marked taken. Skipped doses don't count.</p>
      </form>
    </Sheet>
  );
}

/* ---------------- CC-143: check-ins in Well-being ---------------- */

export function DailyWeek({ state }: { state: State }) {
  const { actions } = useStore();
  const shared = dailyShared(state);
  const week = sharedWeek(state);
  // Opening Maggie's check-ins is written to the access log (once per 10 minutes).
  useEffect(() => { if (shared) actions.logView("daily check-ins"); }, [actions, shared]);
  const goal = state.settings.dailyLog.waterGoal;
  if (!shared) {
    return (
      <section id="wellbeing" className="panel stack" style={{ "--gap": "8px" } as CSSProperties} aria-labelledby="dw-h">
        <h2 id="dw-h" className="hl-name"><EyeOff size={18} aria-hidden="true" /> Daily check-ins · 7 days</h2>
        <p className="muted">{state.settings.sharingPaused ? "Maggie paused sharing, so her feeling, water and meal check-ins are private until she resumes." : "Maggie isn't sharing her feeling, water and meal check-ins right now."} Her “I'm OK” check-in still reaches you. She can change this in her Privacy Center.</p>
      </section>
    );
  }
  const fed = week.filter((d) => d.meals.length > 0).length;
  const water = Math.round((week.reduce((a, d) => a + d.water, 0) / 7) * 10) / 10;
  return (
    <section id="wellbeing" className="panel stack" style={{ "--gap": "14px" } as CSSProperties} aria-labelledby="dw-h">
      <div className="metric-head">
        <h2 id="dw-h" className="hl-name"><Utensils size={18} color="#1baf7a" aria-hidden="true" /> Daily check-ins · 7 days</h2>
        <span className="metric-stats">{water} glasses a day on average · meals logged {fed} of 7 days</span>
      </div>
      <div className="dweek" role="table" aria-label="Feeling, water and meals for the last 7 days">
        <div role="row">
          <span role="columnheader"><span className="sr-only">Check-in</span></span>
          {week.map((d) => <span key={d.date} className="day" role="columnheader">{new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</span>)}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Feeling</span>
          {week.map((d) => { const f = feelingOf(d.feeling); return <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${f?.label ?? "not added"}`} title={f?.label}>{f ? <Face feeling={f.key} size={28} /> : <i className="none" />}</span>; })}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Water</span>
          {week.map((d) => <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${d.water} ${d.water === 1 ? "glass" : "glasses"}`}><span className="wbar" aria-hidden="true"><i style={{ height: `${Math.min(100, (d.water / goal) * 100)}%` }} /></span><span className="num" aria-hidden="true">{d.water}</span></span>)}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Meals</span>
          {week.map((d) => <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${d.meals.length ? d.meals.join(", ") : "no meals logged"}`}><span className="mdots" aria-hidden="true">{MEALS.map((m) => <i key={m.key} className={d.meals.includes(m.key) ? "on" : ""} />)}</span></span>)}
        </div>
      </div>
      <p className="tiny">Maggie adds these herself when she wants to, so a blank day isn't a problem on its own. Days she logged privately show as blank. If she usually logs meals and then logs none for 2 days, you get one gentle note. Water goal: {goal} glasses.</p>
    </section>
  );
}
