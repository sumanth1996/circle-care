// Sprint 26 "Safer Doses" screens: who marked a dose and when, Undo for 10 minutes, "Correct this" (CC-243, CC-244),
// the Stopped list (CC-246) and the demo banner (CC-248).

import { useEffect, useRef, useState } from "react";
import { Check, X, Undo2, PencilLine, RotateCcw, Ban, Info } from "lucide-react";
import { useStore } from "../data/store";
import { dosesFor, isOpen, nameOf, type DoseSlot } from "../data/selectors";
import { canCorrect, canUndo, undoLeft, undoable, statusWord, stoppedLine, DEMO_LABEL } from "../data/saferDoses";
import type { DoseLog, DoseStatus, Medication } from "../data/types";
import { PillArt, Sheet, Segmented, useSpeech, useToast } from "./ui";
import { fmtTime } from "../lib/time";

/** CC-248: every screen says the Safer Doses story is made up. */
export function DemoBanner() {
  const { state } = useStore();
  const name = state.demoScenario === "safer-doses" ? "Safer Doses" : state.demoScenario === "circle-messages" ? "Circle Messages" : null;
  if (!name) return null;
  return (
    <p className="demo-banner" role="note">
      <Info size={16} aria-hidden="true" /> <b>{DEMO_LABEL}</b> {name} scenario. Every person and record here is made up.
    </p>
  );
}

/** "Taken at 8:05 AM by Ana", with Undo for the person who marked it and "Correct this" for Sarah or them. */
export function DoseMarked({ log, label }: { log: DoseLog; label: string }) {
  const { state, actions, me } = useStore();
  const toast = useToast();
  const [fix, setFix] = useState(false);
  const undo = canUndo(state, me, log);
  const correct = canCorrect(me, log);
  return (
    <>
      <p className="tiny dose-marked">
        {statusWord[log.status]} at {fmtTime(log.at)} by {nameOf(state, log.by)}
        {log.reason ? ` — “${log.reason}”` : ""}
        {log.correctedBy ? ` · corrected by ${nameOf(state, log.correctedBy)} at ${fmtTime(log.correctedAt!)}` : ""}
        {log.demo ? ` · ${DEMO_LABEL}` : ""}
      </p>
      {(undo || correct) && (
        <span className="row wrap" style={{ "--gap": "6px", marginTop: 4 } as React.CSSProperties}>
          {undo && (
            <button className="btn sm secondary" onClick={() => { actions.undoDose(log.id); toast(`${label} mark undone`); }} aria-label={`Undo ${label}`}>
              <Undo2 size={15} /> Undo <span className="muted">({undoLeft(state, log)} min)</span>
            </button>
          )}
          {correct && <button className="btn sm plain" onClick={() => setFix(true)} aria-label={`Correct this: ${label}`}><PencilLine size={15} /> Correct this</button>}
        </span>
      )}
      {fix && <CorrectSheet log={log} label={label} onClose={() => setFix(false)} />}
    </>
  );
}

function CorrectSheet({ log, label, onClose }: { log: DoseLog; label: string; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [status, setStatus] = useState<DoseStatus>(log.status);
  const [note, setNote] = useState(log.reason ?? "");
  const same = status === log.status && (status === "taken" || note.trim() === (log.reason ?? ""));
  return (
    <Sheet title={`Correct ${label}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (same) return; actions.correctDose(log.id, status, note); onClose(); toast("Correction saved"); }}>
        <p className="small muted">{nameOf(state, log.by)} recorded it as {statusWord[log.status].toLowerCase()} at {fmtTime(log.at)}. That first entry stays in the history.</p>
        <Segmented label="What really happened" value={status} onChange={setStatus} options={[{ value: "taken", label: "Taken" }, { value: "skipped", label: "Skipped" }, { value: "refused", label: "Declined" }]} />
        {status !== "taken" && (
          <div className="field"><label htmlFor="fix-note">Note (optional)</label><input id="fix-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. She was asleep" /></div>
        )}
        <button className="btn block" disabled={same}>Save correction</button>
        <p className="hint center">{nameOf(state, log.by)} is told if someone else corrects their entry.</p>
      </form>
    </Sheet>
  );
}

/** CC-243 criterion 2: "Your tap wasn't saved: Ana recorded it first." on the row, for the person who came second. */
export function DuplicateNote({ d }: { d: DoseSlot }) {
  const { state, me } = useStore();
  const e = [...(state.doseHistory ?? [])].reverse().find((x) => x.kind === "duplicate" && x.by === me && x.medId === d.med.id && x.date === d.date && x.time === d.time);
  if (!e || !d.log) return null;
  return <p className="tiny dose-dup" role="status"><Ban size={13} aria-hidden="true" /> Your tap at {fmtTime(e.at)} wasn't saved: {nameOf(state, e.firstBy)} recorded it first.</p>;
}

/** CC-243: the second person is told who got there first, on any screen, including a tap from another tab. */
export function DoseConflictToasts() {
  const { state, me } = useStore();
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  const events = state.doseHistory ?? [];
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(events.map((e) => e.id)); return; }
    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (e.kind !== "duplicate" || e.by !== me || e.demo) continue;
      const med = state.meds.find((m) => m.id === e.medId)?.name ?? "That dose";
      const first = state.doses.find((x) => x.id === e.doseId);
      toast(`Already recorded: ${med} was marked ${statusWord[first?.status ?? "taken"].toLowerCase()} by ${nameOf(state, e.firstBy)}${first ? ` at ${fmtTime(first.at)}` : ""}. Your tap wasn't saved.`);
    }
  }, [events, me, state, toast]);
  return null;
}

/** Today's doses with who marked each, for James and Sarah (CC-243). Open doses can be marked here too. */
export function TodayDoses() {
  const { state, actions } = useStore();
  const toast = useToast();
  const doses = dosesFor(state);
  return (
    <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-label="Today's doses">
      <h2 className="section-title">Today's doses</h2>
      {doses.length === 0 && <p className="muted small">No medicines are scheduled today.</p>}
      <div className="list">
        {doses.map((d) => {
          const label = `${d.med.name} at ${fmtTime(d.time)}`;
          return (
            <div key={d.key} className="list-row dose-row" style={{ alignItems: "flex-start" }} data-dose={d.key}>
              <PillArt med={d.med} size={40} />
              <div className="grow">
                <span className="list-title" style={{ display: "block" }}>{d.med.name} {d.med.strength}</span>
                <span className="list-sub" style={{ display: "block" }}>{fmtTime(d.time)} · {d.med.dose}</span>
                {d.log ? <><DoseMarked log={d.log} label={label} /><DuplicateNote d={d} /></> : !isOpen(d) && <p className="tiny muted">Later today</p>}
              </div>
              {!d.log && isOpen(d) && (
                <span className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
                  <button className="btn sm" style={{ background: "var(--green)" }} aria-label={`Taken: ${label}`} onClick={() => { actions.recordDose(d.med.id, d.time, "taken", undefined, d.date); toast(`${d.med.name} marked as taken`); }}><Check size={15} /> Taken</button>
                  <button className="btn sm plain" aria-label={`Not taken: ${label}`} onClick={() => { actions.recordDose(d.med.id, d.time, "skipped", undefined, d.date); toast("Recorded"); }}><X size={15} /> Not taken</button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">Each dose is recorded once. If it's wrong, Sarah or whoever recorded it can correct it, and the first entry stays in the history.</p>
    </section>
  );
}

/** CC-244 criterion 2: a large Undo on Maggie's home for 10 minutes after she marks a dose. */
export function ElderUndoBanner() {
  const { state, actions, me } = useStore();
  const toast = useToast();
  const { speak } = useSpeech();
  const d = undoable(state, me);
  if (!d) return null;
  const med = state.meds.find((m) => m.id === d.medId);
  return (
    <div className="elder-undo" role="region" aria-label="Undo your last dose">
      <div className="grow">
        <b>You marked {med?.name ?? "your medicine"} as {statusWord[d.status].toLowerCase()}.</b>
        <p className="muted" style={{ fontSize: "0.85em" }}>Was that a mistake? You can undo it for {undoLeft(state, d)} more {undoLeft(state, d) === 1 ? "minute" : "minutes"}.</p>
      </div>
      <button className="btn lg" style={{ background: "var(--elder)" }} onClick={() => { actions.undoDose(d.id); toast("Undone. It's not marked any more."); if (state.settings.readAloud) speak("Undone. It's not marked any more."); }}>
        <Undo2 size={28} /> Undo
      </button>
    </div>
  );
}

/** CC-246: stopped medicines on their own list, with when and who, and Restart. */
export function StoppedMeds() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [restart, setRestart] = useState<Medication | null>(null);
  const stopped = state.meds.filter((m) => m.stopped);
  if (!stopped.length) return null;
  return (
    <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-label="Stopped medicines">
      <h2 className="section-title">Stopped</h2>
      <div className="list">
        {stopped.map((m) => (
          <div key={m.id} className="list-row" style={{ alignItems: "flex-start" }}>
            <PillArt med={m} size={40} />
            <div className="grow">
              <span className="list-title" style={{ display: "block" }}>{m.name} {m.strength}</span>
              <span className="list-sub" style={{ display: "block" }}>{stoppedLine(state, m)}{m.stopped?.reason ? ` · ${m.stopped.reason}` : ""}{m.stopped?.demo ? ` · ${DEMO_LABEL}` : ""}</span>
              <span className="tiny muted">No reminders.</span>
            </div>
            <button className="btn sm secondary" onClick={() => setRestart(m)} aria-label={`Restart ${m.name}`}><RotateCcw size={15} /> Restart</button>
          </div>
        ))}
      </div>
      {restart && (
        <Sheet title={`Restart ${restart.name}?`} onClose={() => setRestart(null)}>
          <div className="stack">
            <p>{stoppedLine(state, restart)}. Restarting puts it back on Maggie's schedule at {restart.times.map((t) => fmtTime(t)).join(", ")}, with reminders.</p>
            <p className="small muted">The change is logged and Maggie will see it in “Updates about me”.</p>
            <button className="btn block" onClick={() => { actions.restartMed(restart.id); setRestart(null); toast(`${restart.name} restarted`); }}>Restart {restart.name}</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
