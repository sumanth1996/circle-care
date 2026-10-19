import { useEffect, useState } from "react";
import { Plus, Clock, History, AlertCircle, Pause, Play } from "lucide-react";
import { useStore } from "../../data/store";
import { nameOf } from "../../data/selectors";
import { PillArt, Sheet, Toggle, useToast, IconTile, taskIcons, Segmented } from "../../components/ui";
import { fmtTime, fmtShortDay, uid } from "../../lib/time";
import type { Medication, CareTask } from "../../data/types";
import "./guardian.css";

const blank = (): Medication => ({ id: uid("med"), name: "", strength: "", dose: "1 tablet", times: ["08:00"], instructions: "", prescriber: "", purpose: "", critical: false, paused: false, pill: { color: "#FFFFFF", shape: "round" }, history: [] });
const pillColors = ["#FFFFFF", "#F7C6A3", "#FFD966", "#D9E7FF", "#C9F0D5", "#F5C2D9"];

/** CC-36 add medication · CC-37 edit/pause (guardian applies directly) · CC-43 high-priority flag · CC-44 recurring care tasks. */
export default function Medications() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [edit, setEdit] = useState<{ med: Medication; isNew: boolean } | null>(null);
  const [history, setHistory] = useState<Medication | null>(null);
  const [taskSheet, setTaskSheet] = useState(false);

  useEffect(() => { actions.logView("medications"); }, [actions]);

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="page-kicker">Maggie's plan</p><h1>Medicines & routines</h1></div>
        <button className="btn" onClick={() => setEdit({ med: blank(), isNew: true })}><Plus size={18} /> Add medicine</button>
      </div>

      <div className="grid-2">
        {state.meds.map((m) => (
          <article key={m.id} className="panel stack" style={{ "--gap": "12px", opacity: m.paused ? 0.6 : 1 } as React.CSSProperties}>
            <div className="med-card">
              <PillArt med={m} size={56} />
              <div className="grow">
                <div className="row wrap" style={{ "--gap": "6px" } as React.CSSProperties}>
                  <h2 className="t-sm">{m.name} {m.strength}</h2>
                  {m.critical && <span className="badge red"><AlertCircle size={13} /> High priority</span>}
                  {m.paused && <span className="badge">Paused</span>}
                </div>
                <p className="muted small">{m.purpose} · {m.dose} · {m.prescriber}</p>
              </div>
            </div>
            <div className="timechips">{m.times.map((t) => <span key={t} className="timechip"><Clock size={14} /> {fmtTime(t)}</span>)}</div>
            <p className="small">{m.instructions}</p>
            <div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>
              <button className="btn sm secondary" onClick={() => setEdit({ med: structuredClone(m), isNew: false })}>Edit</button>
              <button className="btn sm plain" onClick={() => { actions.saveMed({ ...m, paused: !m.paused }, false); toast(m.paused ? `${m.name} resumed` : `${m.name} paused`); }}>{m.paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}</button>
              <button className="btn sm ghost" onClick={() => setHistory(m)}><History size={15} /> History</button>
            </div>
          </article>
        ))}
      </div>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <div className="section-head"><h2 className="section-title">Daily routines</h2><button className="btn sm secondary" onClick={() => setTaskSheet(true)}><Plus size={16} /> Add routine</button></div>
        <div className="list">
          {state.tasks.map((t) => (
            <div key={t.id} className="list-row has-icon">
              <IconTile icon={taskIcons[t.icon]} color="var(--care)" />
              <span className="grow"><span className="list-title" style={{ display: "block" }}>{t.title}</span><span className="list-sub">{fmtTime(t.time)} · {t.recurrence === "daily" ? "Every day" : t.recurrence === "weekdays" ? "Weekdays" : "Weekends"} · {t.assignee === "caregiver" ? "Caregiver on shift" : t.assignee === "elder" ? "Maggie" : nameOf(state, t.assignee)}</span></span>
            </div>
          ))}
        </div>
      </section>

      {edit && <MedForm med={edit.med} isNew={edit.isNew} onClose={() => setEdit(null)} onSave={(m) => { actions.saveMed(m, edit.isNew); setEdit(null); toast(edit.isNew ? `${m.name} added` : `${m.name} updated`); }} />}
      {history && (
        <Sheet title={`${history.name} history`} onClose={() => setHistory(null)}>
          <div className="list">
            {[...history.history].reverse().map((h, i) => <div key={i} className="list-row" style={{ alignItems: "flex-start" }}><span className="grow"><b>{h.change}</b><span className="list-sub" style={{ display: "block" }}>{nameOf(state, h.by)} · {fmtShortDay(h.at)}, {fmtTime(h.at)}</span></span></div>)}
          </div>
        </Sheet>
      )}
      {taskSheet && <TaskForm onClose={() => setTaskSheet(false)} onSave={(t) => { actions.addTask(t); setTaskSheet(false); toast("Routine added"); }} />}
    </div>
  );
}

function MedForm({ med, isNew, onClose, onSave }: { med: Medication; isNew: boolean; onClose: () => void; onSave: (m: Medication) => void }) {
  const [m, setM] = useState(med);
  const set = <K extends keyof Medication>(k: K, v: Medication[K]) => setM({ ...m, [k]: v });
  const valid = m.name.trim() && m.strength.trim() && m.dose.trim() && m.times.length > 0 && m.times.every((t) => /^\d{2}:\d{2}$/.test(t));
  return (
    <Sheet title={isNew ? "Add a medicine" : `Edit ${med.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (valid) onSave(m); }}>
        <div className="grid-2">
          <div className="field"><label htmlFor="m-name">Name</label><input id="m-name" className="input" required value={m.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Lisinopril" /></div>
          <div className="field"><label htmlFor="m-str">Strength</label><input id="m-str" className="input" required value={m.strength} onChange={(e) => set("strength", e.target.value)} placeholder="e.g. 10 mg" /></div>
          <div className="field"><label htmlFor="m-dose">Dose</label><input id="m-dose" className="input" required value={m.dose} onChange={(e) => set("dose", e.target.value)} /></div>
          <div className="field"><label htmlFor="m-pur">What it's for</label><input id="m-pur" className="input" value={m.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. Blood pressure" /></div>
        </div>
        <div className="field">
          <span className="label">Times</span>
          <div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>
            {m.times.map((t, i) => (
              <span key={i} className="row" style={{ "--gap": "4px" } as React.CSSProperties}>
                <input type="time" className="input" style={{ width: 140 }} value={t} onChange={(e) => set("times", m.times.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Time ${i + 1}`} />
                {m.times.length > 1 && <button type="button" className="btn sm plain" aria-label="Remove time" onClick={() => set("times", m.times.filter((_, j) => j !== i))}>×</button>}
              </span>
            ))}
            <button type="button" className="btn sm secondary" onClick={() => set("times", [...m.times, "12:00"])}><Plus size={14} /> Time</button>
          </div>
        </div>
        <div className="field"><label htmlFor="m-ins">Instructions</label><input id="m-ins" className="input" value={m.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="e.g. Take with food" /></div>
        <div className="field"><label htmlFor="m-pre">Prescriber</label><input id="m-pre" className="input" value={m.prescriber} onChange={(e) => set("prescriber", e.target.value)} /></div>
        <div className="field">
          <span className="label">How it looks</span>
          <div className="row wrap">
            <Segmented label="Shape" value={m.pill.shape} onChange={(v) => set("pill", { ...m.pill, shape: v })} options={[{ value: "round", label: "Round" }, { value: "oval", label: "Oval" }, { value: "capsule", label: "Capsule" }]} />
            <div className="row" style={{ "--gap": "6px" } as React.CSSProperties} role="group" aria-label="Color">
              {pillColors.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={m.pill.color === c} onClick={() => set("pill", { ...m.pill, color: c })} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: m.pill.color === c ? "3px solid var(--blue)" : "1px solid var(--line)", cursor: "pointer" }} />)}
            </div>
            <PillArt med={m} size={44} />
          </div>
        </div>
        <label className="list-row panel flat" style={{ padding: "12px 16px" }}>
          <span className="grow"><b>High priority</b><span className="list-sub" style={{ display: "block" }}>Missed doses escalate twice as fast and are marked critical.</span></span>
          <Toggle checked={m.critical} onChange={(v) => set("critical", v)} label="High priority" />
        </label>
        <button className="btn lg block" disabled={!valid}>{isNew ? "Add to schedule" : "Save changes"}</button>
        <p className="hint center">The change is logged and Maggie will see it in “Updates about me”.</p>
      </form>
    </Sheet>
  );
}

function TaskForm({ onClose, onSave }: { onClose: () => void; onSave: (t: Omit<CareTask, "id">) => void }) {
  const [t, setT] = useState<Omit<CareTask, "id">>({ title: "", icon: "heart", time: "11:00", recurrence: "daily", assignee: "caregiver" });
  return (
    <Sheet title="Add a routine" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (t.title.trim()) onSave(t); }}>
        <div className="field"><label htmlFor="t-title">What</label><input id="t-title" className="input" required value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="e.g. Afternoon stretches" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="t-time">When</label><input id="t-time" type="time" className="input" value={t.time} onChange={(e) => setT({ ...t, time: e.target.value })} /></div>
          <div className="field"><label htmlFor="t-rec">Repeats</label><select id="t-rec" className="input" value={t.recurrence} onChange={(e) => setT({ ...t, recurrence: e.target.value as CareTask["recurrence"] })}><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option></select></div>
        </div>
        <div className="field"><label htmlFor="t-who">Who</label><select id="t-who" className="input" value={t.assignee} onChange={(e) => setT({ ...t, assignee: e.target.value })}><option value="caregiver">Caregiver on shift</option><option value="elder">Maggie</option></select></div>
        <div className="field"><span className="label">Icon</span><div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>{Object.entries(taskIcons).map(([k, I]) => <button type="button" key={k} aria-label={k} aria-pressed={t.icon === k} onClick={() => setT({ ...t, icon: k })} className="icon-tile" style={{ background: t.icon === k ? "var(--care)" : "var(--mist)", color: t.icon === k ? "#fff" : "var(--ink-2)", border: 0, cursor: "pointer" }}><I size={20} /></button>)}</div></div>
        <button className="btn lg block" disabled={!t.title.trim()}>Add routine</button>
      </form>
    </Sheet>
  );
}
