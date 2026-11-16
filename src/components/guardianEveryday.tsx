import { useEffect, useState, type CSSProperties } from "react";
import { PackageCheck, PackagePlus, Truck, EyeOff, Utensils, Moon, MessageCircleHeart, Pill, Sun, UserRound, CalendarHeart, Droplets, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { Medication, State } from "../data/types";
import { useStore, useCan } from "../data/store";
import { pillsLeft, daysLeft, supplyState, refillPlan, scheduledRefill, sharedWeek, feelingOf, MEALS, dailyShared, recap } from "../data/everyday";
import { Face } from "./everyday";
import { nameOf } from "../data/selectors";
import { Sheet, useToast } from "./ui";
import { fmtShortDay, fmtTime } from "../lib/time";
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
  // Days Maggie kept private count for nothing either way, so the averages cover shared days only.
  const seen = week.filter((d) => !d.private);
  const fed = seen.filter((d) => d.meals.length > 0).length;
  const water = seen.length ? Math.round((seen.reduce((a, d) => a + d.water, 0) / seen.length) * 10) / 10 : 0;
  return (
    <section id="wellbeing" className="panel stack" style={{ "--gap": "14px" } as CSSProperties} aria-labelledby="dw-h">
      <div className="metric-head">
        <h2 id="dw-h" className="hl-name"><Utensils size={18} color="#1baf7a" aria-hidden="true" /> Daily check-ins · 7 days</h2>
        <span className="metric-stats">{seen.length ? `${water} glasses a day on average · meals logged ${fed} of ${seen.length} days` : "Not shared this week"}</span>
      </div>
      <div className="dweek" role="table" aria-label="Feeling, water and meals for the last 7 days">
        <div role="row">
          <span role="columnheader"><span className="sr-only">Check-in</span></span>
          {week.map((d) => <span key={d.date} className="day" role="columnheader">{new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</span>)}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Feeling</span>
          {week.map((d) => { const f = feelingOf(d.feeling); if (d.private) return <NotShared key={d.date} date={d.date} />; return <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${f?.label ?? "not added"}`} title={f?.label}>{f ? <Face feeling={f.key} size={28} /> : <i className="none" />}</span>; })}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Water</span>
          {week.map((d) => d.private ? <NotShared key={d.date} date={d.date} /> : <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${d.water} ${d.water === 1 ? "glass" : "glasses"}`}><span className="wbar" aria-hidden="true"><i style={{ height: `${Math.min(100, (d.water / goal) * 100)}%` }} /></span><span className="num" aria-hidden="true">{d.water}</span></span>)}
        </div>
        <div role="row">
          <span className="lab" role="rowheader">Meals</span>
          {week.map((d) => d.private ? <NotShared key={d.date} date={d.date} /> : <span key={d.date} className="cell" role="cell" aria-label={`${fmtShortDay(d.date)}: ${d.meals.length ? d.meals.join(", ") : "no meals logged"}`}><span className="mdots" aria-hidden="true">{MEALS.map((m) => <i key={m.key} className={d.meals.includes(m.key) ? "on" : ""} />)}</span></span>)}
        </div>
      </div>
      <p className="tiny">Maggie adds these herself when she wants to, so a blank day isn't a problem on its own. Days she kept private show a dash and aren't counted. If she usually logs meals and then logs none for 2 days, you get one gentle note. Water goal: {goal} glasses.</p>
    </section>
  );
}

/** A day Maggie kept private: a dash, with no counts to read. */
function NotShared({ date }: { date: string }) {
  return <span className="cell" role="cell" aria-label={`${fmtShortDay(date)}: not shared`}><span className="ns" aria-hidden="true">–</span></span>;
}

/* ---------------- CC-191: evening recap ---------------- */

const doseList = (ds: { name: string; time: string }[]) => ds.map((d) => `${d.name}, ${fmtTime(d.time)}`).join("; ");

/** Sarah's calm summary of Maggie's day, on Home from 6 PM. */
export function EveningRecap({ state }: { state: State }) {
  const r = recap(state);
  const { hash } = useLocation();
  // The 7 PM update opens Home at #recap: bring the card into view.
  useEffect(() => { if (hash === "#recap") document.getElementById("recap")?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }, [hash]);
  const feeling = r.log && !r.log.private ? feelingOf(r.log.feeling) : undefined;
  const t = r.tomorrow;
  const d = r.doses;
  const looks = [
    d.unconfirmed.length ? `Not confirmed: ${doseList(d.unconfirmed)}` : "",
    d.skipped.length ? `Skipped: ${doseList(d.skipped)}` : "",
    d.refused.length ? `Refused: ${doseList(d.refused)}` : "",
  ].filter(Boolean);
  return (
    <section id="recap" className="recap glass" aria-labelledby="recap-k recap-h">
      <div className="row between wrap">
        <div>
          <p id="recap-k" className="page-kicker recap-kicker"><Moon size={15} aria-hidden="true" /> Evening recap</p>
          <h2 id="recap-h" className="t-md">{r.headline}</h2>
        </div>
        {r.newMessages > 0 && <Link to="/app/guardian/chat" className="btn sm secondary recap-tap"><MessageCircleHeart size={16} aria-hidden="true" /> {r.newMessages} new in chat</Link>}
      </div>
      <div className="recap-grid">
        <div className="recap-cell">
          <span className="k"><Pill size={14} aria-hidden="true" /> Medicines</span>
          {!d.any ? (
            <><span className="v">None today</span><span className="s">No medicines scheduled</span></>
          ) : (
            <>
              <span className="v">{d.total ? `${d.taken} of ${d.total}` : "None yet"}</span>
              {looks.map((l) => <span key={l} className="s warn">{l}</span>)}
              {d.due.length > 0 && <span className="s">Due now: {doseList(d.due)}</span>}
              {!looks.length && !d.due.length && <span className="s">{d.total ? (d.next ? `All confirmed. Next at ${fmtTime(d.next)}` : "All confirmed today") : d.next ? `First at ${fmtTime(d.next)}` : ""}</span>}
            </>
          )}
        </div>
        <div className="recap-cell">
          <span className="k"><Sun size={14} aria-hidden="true" /> Check-in</span>
          <span className="v">{r.checkin ? fmtTime(r.checkin) : r.checkinMissed ? "Missed" : "Not yet"}</span>
          <span className="s">{r.tasks.total ? `${r.tasks.done} of ${r.tasks.total} routines done` : "No routines today"}</span>
        </div>
        <div className="recap-cell">
          <span className="k"><UserRound size={14} aria-hidden="true" /> Visits</span>
          <span className="v">{r.visits.length ? r.visits.map((v) => v.who).join(", ") : "None today"}</span>
          <span className="s">{r.visits.map((v) => `${fmtTime(v.from)} to ${v.to ? fmtTime(v.to) : "now"}`).join(" · ") || "No caregiver visit"}</span>
        </div>
        {r.log && !r.log.private ? (
          <div className="recap-cell">
            <span className="k">{feeling ? <Face feeling={feeling.key} size={16} /> : <Droplets size={14} aria-hidden="true" />} Her day</span>
            <span className="v">{feeling?.label ?? "No feeling added"}</span>
            <span className="s">{r.log.water} {r.log.water === 1 ? "glass" : "glasses"} · {r.log.meals.length} of 3 meals</span>
          </div>
        ) : (
          <div className="recap-cell">
            <span className="k"><EyeOff size={14} aria-hidden="true" /> Her day</span>
            <span className="v">Private</span>
            <span className="s">Maggie isn't sharing today</span>
          </div>
        )}
        <div className="recap-cell">
          <span className="k"><CalendarHeart size={14} aria-hidden="true" /> Tomorrow</span>
          {t?.kind === "appointment" ? (
            <><span className="v">{fmtTime(t.time)} · {t.title}</span>{t.note && <span className="s">{t.note}</span>}</>
          ) : t?.kind === "visit" ? (
            <><span className="v">{fmtTime(t.time)}</span><span className="s">{t.who} visits until {fmtTime(t.until)}</span></>
          ) : (
            <><span className="v">Nothing booked</span><span className="s">A free day</span></>
          )}
        </div>
      </div>
      {r.low.map((l) => (
        <p key={l.name} className="small recap-refill">
          <Link to="/app/guardian/meds" className="recap-tap">{l.name}: {l.days} {l.days === 1 ? "day" : "days"} left.</Link>{" "}
          {l.on ? `A refill is on the Calendar for ${fmtShortDay(l.on)}.` : "Not on the Calendar yet."}
        </p>
      ))}
      <div className="row between wrap">
        {looks.length > 0 || d.due.length > 0 || r.low.length > 0 ? <Link to="/app/guardian/meds" className="btn sm recap-tap">Review medicines</Link> : <span />}
        <Link to="/app/guardian/digest" className="small recap-week recap-tap">See the week <ChevronRight size={14} aria-hidden="true" /></Link>
      </div>
      <p className="tiny">{state.settings.recapNotify === false ? "The 7 PM update is off. You can turn it on in Settings." : "One update at 7 PM. Health details stay in the app."}</p>
    </section>
  );
}
