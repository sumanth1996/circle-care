import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Lock, Plus, Trash2, CalendarCheck } from "lucide-react";
import { useStore } from "../data/store";
import { meId, nameOf, member, todayOf } from "../data/selectors";
import { notesView, nextStepsFor, noteTaker, stepOwners, recentVisits, ANSWER_MAX, SUMMARY_MAX, STEP_MAX } from "../data/visitNotes";
import { phiHint } from "../data/everyday";
import { ELDER } from "../data/demo";
import { useToast } from "./ui";
import { HealthHint } from "./chat";
import { fmtDay, fmtShortDay, fmtTime } from "../lib/time";
import "./sprint18.css";

/**
 * CC-218: after-visit notes. Whoever went (or Maggie, or Sarah) writes the answer under each question, anything
 * else the doctor said, and the next steps. A next step with an owner and a day becomes a care task for them.
 * Others read the notes while Maggie shares her appointments with them.
 */
export function VisitNotesPage() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const me = meId(state.persona);
  const { id = "" } = useParams();
  const view = notesView(state, me, id);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries((view?.questions ?? []).map((x) => [x.q.id, x.answer])));
  const [summary, setSummary] = useState(view?.summary ?? "");
  const [editing, setEditing] = useState(!view?.notes);

  useEffect(() => { actions.logView("after-visit notes"); }, [actions]);

  const back = <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>;

  if (!view) {
    return (
      <div className="page narrow stack" style={{ "--gap": "16px" } as CSSProperties}>
        {back}
        <div className="page-head"><div><p className="page-kicker">After the visit</p><h1>Visit notes</h1></div></div>
        <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties}>
          <Lock size={24} color="var(--muted)" />
          <b>Not shared with you</b>
          <p className="muted small">Maggie's sharing choices keep her appointments private right now, or this visit hasn't happened yet.</p>
        </section>
      </div>
    );
  }

  const { appt, questions, nextSteps, notes, canWrite } = view;
  const taker = noteTaker(appt);
  const save = () => {
    actions.saveVisitNotes(appt.id, { answers, summary });
    setEditing(false);
    toast("Notes saved. Everyone who can see Maggie's visits can read them");
  };

  return (
    <div className="page narrow stack visit-notes" style={{ "--gap": "18px" } as CSSProperties}>
      {back}
      <div className="page-head">
        <div><p className="page-kicker">After the visit</p><h1>{appt.title}</h1></div>
      </div>
      <p className="muted notes-when">{fmtDay(appt.date)} at {fmtTime(appt.time)}{appt.escortId ? ` · ${appt.escortId === me ? "You" : nameOf(state, appt.escortId)} went with Maggie` : ""}</p>

      {!notes && !canWrite && <section className="panel notes-empty"><ClipboardList size={22} color="var(--muted)" aria-hidden="true" /> <span>No notes yet. {member(state, taker)?.short ?? nameOf(state, taker)} will add them.</span></section>}

      {canWrite && editing ? (
        <form className="stack" style={{ "--gap": "14px" } as CSSProperties} aria-label="Visit notes" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {questions.length > 0 && <h2 className="notes-h">The questions</h2>}
          {questions.map(({ q }, i) => (
            <label key={q.id} className="field panel notes-q">
              <span><span className="q-n" aria-hidden="true">{i + 1}</span> {q.text}</span>
              <textarea className="input" rows={2} maxLength={ANSWER_MAX} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} aria-label={`Answer: ${q.text}`} placeholder="What the doctor said" />
            </label>
          ))}
          <label className="field"><span>Anything else the doctor said</span>
            <textarea className="input" rows={3} maxLength={SUMMARY_MAX} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <button className="btn lg">Save notes</button>
          <p className="tiny">Everyone Maggie shares her appointments with can read these notes.</p>
        </form>
      ) : notes ? (
        <section className="stack" style={{ "--gap": "12px" } as CSSProperties} aria-label="Visit notes">
          {questions.length > 0 && <h2 className="notes-h">The questions</h2>}
          <ol className="notes-answers">
            {questions.map(({ q, answer }) => (
              <li key={q.id} className="panel" aria-label={q.text}>
                <b>{q.text}</b>
                <p className={answer ? "" : "muted small"}>{answer || "No answer written."}</p>
              </li>
            ))}
          </ol>
          {view.summary && <div className="panel"><b>Anything else the doctor said</b><p>{view.summary}</p></div>}
          <p className="tiny">Written by {notes.by === me ? "you" : nameOf(state, notes.by)}{notes.updatedBy ? `, last changed by ${notes.updatedBy === me ? "you" : nameOf(state, notes.updatedBy)}` : ""}</p>
          {canWrite && <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>Change notes</button>}
        </section>
      ) : null}

      {(canWrite || nextSteps.length > 0) && <NextSteps apptId={appt.id} canWrite={canWrite} />}
    </div>
  );
}

function NextSteps({ apptId, canWrite }: { apptId: string; canWrite: boolean }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const view = notesView(state, me, apptId);
  const steps = view?.nextSteps ?? [];
  const owners = stepOwners(state);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState(me);
  const [date, setDate] = useState(todayOf(state));
  const [hint, setHint] = useState<string[] | null>(null);
  const label = (id: string) => (id === me ? "You" : id === ELDER ? "Maggie" : member(state, id)?.short ?? nameOf(state, id));

  const add = () => {
    actions.addNextStep(apptId, { text: text.trim(), owner, date });
    toast(owner === me ? "Added to your tasks" : `${label(owner)} will see it in their tasks`);
    setText(""); setHint(null);
  };
  const submit = () => {
    const t = text.trim();
    if (!t || !date) return;
    const spotted = phiHint(state, t);
    if (spotted.length) setHint(spotted); else add();
  };

  return (
    <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="notes-steps">
      <h2 id="notes-steps" className="notes-h" style={{ margin: 0 }}>Next steps</h2>
      {steps.length === 0 && <p className="muted small">No next steps yet.</p>}
      {steps.length > 0 && (
        <ul className="notes-steps" aria-label="Next steps list">
          {steps.map((s) => {
            const done = state.taskLogs.some((l) => l.taskId === s.taskId);
            return (
              <li key={s.id} aria-label={s.text}>
                {done ? <CheckCircle2 size={20} color="var(--green)" aria-hidden="true" /> : <CalendarCheck size={20} color="var(--blue)" aria-hidden="true" />}
                <span className="grow"><b>{s.text}</b><span className="muted small" style={{ display: "block" }}>{label(s.owner)} · {fmtShortDay(s.date)}{done ? " · Done" : ""}</span></span>
                {canWrite && !done && <button className="btn plain sm" aria-label={`Remove ${s.text}`} onClick={() => { actions.removeNextStep(apptId, s.id); toast("Removed"); }}><Trash2 size={16} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <form className="stack notes-add" style={{ "--gap": "10px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="field"><span>Next step</span><input className="input" maxLength={STEP_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Book the eye exam" /></label>
          <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
            <label className="field grow"><span>Who</span>
              <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                {owners.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
              </select>
            </label>
            <label className="field grow"><span>When</span><input className="input" type="date" min={todayOf(state)} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          </div>
          <button className="btn secondary" disabled={!text.trim() || !date} style={{ alignSelf: "flex-start" }}><Plus size={18} /> Add step</button>
          <p className="tiny">Each step becomes a task for that person on that day.</p>
        </form>
      )}
      {hint && <HealthHint text={text.trim()} spotted={hint} canNote={false} onNote={() => undefined} onSend={add} onEdit={() => setHint(null)} sendLabel="Save anyway" intro="This step becomes a task its owner sees in their list. Health details are safer on Maggie's record, where her sharing choices decide who sees them." noNoteText="Edit the step to leave the health detail out, or save it anyway." />}
    </section>
  );
}

/** CC-218: each person's own next steps from visits, on their home or board, with a Done button. */
export function MyNextSteps() {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const steps = nextStepsFor(state, me);
  if (steps.length === 0) return null;
  const today = todayOf(state);
  return (
    <section className="panel stack my-steps" style={{ "--gap": "10px" } as CSSProperties} aria-label="Your next steps">
      <h2 className="notes-h" style={{ margin: 0 }}>Your next steps</h2>
      <ul className="notes-steps">
        {steps.map((x) => (
          <li key={x.task.id} aria-label={x.task.title}>
            {x.done ? <CheckCircle2 size={20} color="var(--green)" aria-hidden="true" /> : <CalendarCheck size={20} color={x.overdue ? "#9a6700" : "var(--blue)"} aria-hidden="true" />}
            <span className="grow"><b>{x.task.title}</b><span className="muted small" style={{ display: "block" }}>{x.task.date === today ? "Today" : fmtShortDay(x.task.date!)}{x.overdue ? " · past its day" : ""}{x.done ? " · Done" : ""}{x.task.apptId ? <> · <Link to={`/app/${state.persona}/visit-notes/${x.task.apptId}`}>From the visit notes</Link></> : null}</span></span>
            {!x.done && <button className="btn secondary sm" onClick={() => { actions.finishNextStep(x.task.id); toast("Marked done"); }}><Check size={16} /> Done</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** CC-218: past visits with a link to their notes, under the question list. */
export function RecentVisits() {
  const { state } = useStore();
  const me = meId(state.persona);
  const visits = recentVisits(state, me).slice(0, 5);
  if (visits.length === 0) return null;
  return (
    <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="recent-visits">
      <h2 id="recent-visits" className="notes-h" style={{ margin: 0 }}>After the visit</h2>
      <ul className="notes-recent">
        {visits.map((a) => (
          <li key={a.id} className="panel">
            <span className="grow"><b>{a.title}</b><span className="muted small" style={{ display: "block" }}>{fmtShortDay(a.date)} · {a.notes ? "Notes added" : "No notes yet"}</span></span>
            <Link className="btn secondary sm" to={`/app/${state.persona}/visit-notes/${a.id}`} aria-label={`Notes for ${a.title}, ${fmtShortDay(a.date)}`}><ClipboardList size={16} /> Notes</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

