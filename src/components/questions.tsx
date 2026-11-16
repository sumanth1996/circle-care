import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUp, ArrowDown, Eye, EyeOff, Printer, Trash2, ListChecks, Clock } from "lucide-react";
import { useStore } from "../data/store";
import { meId, nameOf } from "../data/selectors";
import { onShift } from "../data/policy";
import { canSeeQuestions, questionsFor, upcomingVisits, printList, QUESTION_MAX } from "../data/visitQuestions";
import { phiHint } from "../data/everyday";
import { ELDER, GUARDIAN } from "../data/demo";
import { Toggle, useToast } from "./ui";
import { HealthHint } from "./chat";
import { fmtDay, fmtShortDay, fmtTime } from "../lib/time";
import "./sprint17.css";

/**
 * CC-217: the shared question list for an upcoming visit. Sarah, James, Maggie and Ana (on shift) can add to it,
 * and everyone sees who added what. Maggie can hide an item so only she and Sarah see it. Sarah sets the order.
 */
export function VisitQuestions() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const me = meId(state.persona);
  const [params, setParams] = useSearchParams();
  const visits = upcomingVisits(state, me);
  const apptId = params.get("appt") && visits.some((v) => v.id === params.get("appt")) ? params.get("appt")! : visits[0]?.id;
  const appt = visits.find((v) => v.id === apptId);
  const list = appt ? questionsFor(state, me, appt.id) : [];
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string[] | null>(null);
  const isElder = me === ELDER;
  const isGuardian = me === GUARDIAN;
  const base = `/app/${state.persona}`;

  useEffect(() => { actions.logView("visit questions"); }, [actions]);

  if (!canSeeQuestions(state, me)) {
    return (
      <div className="page narrow stack" style={{ "--gap": "16px" } as CSSProperties}>
        <div className="page-head"><div><p className="page-kicker">Maggie's visits</p><h1>Questions for the doctor</h1></div></div>
        <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties}>
          <Clock size={26} color="var(--muted)" />
          <b>{state.persona === "caregiver" && !onShift(state, me) ? "Available while you're on shift" : "Not shared with you"}</b>
          <p className="muted small">{state.persona === "caregiver" ? "You can see and add questions once you check in for a visit." : "Maggie's sharing choices keep this list private right now."}</p>
        </section>
      </div>
    );
  }

  const add = () => {
    if (!appt || !text.trim()) return;
    actions.addQuestion(appt.id, text.trim());
    setText("");
    setHint(null);
    toast("Added to the list");
  };
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    const spotted = phiHint(state, t);
    if (spotted.length) setHint(spotted);
    else add();
  };

  return (
    <div className="page narrow stack questions" style={{ "--gap": "18px" } as CSSProperties}>
      {isElder && <Link to="/app/elder" className="btn ghost ask-back"><ArrowLeft /> Home</Link>}
      <div className="page-head">
        <div><p className="page-kicker">Maggie's visits</p><h1>Questions for the doctor</h1></div>
        {(isGuardian || isElder) && appt && <button className="btn secondary" onClick={() => nav(`${base}/questions/print/${appt.id}`)}><Printer size={18} /> Print</button>}
      </div>

      {visits.length === 0 ? <p className="muted">No upcoming visits.</p> : (
        <>
          <label className="field"><span>Visit</span>
            <select className="input" value={apptId} onChange={(e) => setParams({ appt: e.target.value })}>
              {visits.map((v) => <option key={v.id} value={v.id}>{v.title}, {fmtShortDay(v.date)} at {fmtTime(v.time)}</option>)}
            </select>
          </label>

          <ol className="q-list" aria-label="Questions">
            {list.length === 0 && <li className="muted small q-empty">No questions yet. Add the first one.</li>}
            {list.map((q, i) => (
              <li key={q.id} className={`panel q-item ${q.hidden ? "hidden" : ""}`} aria-label={q.text}>
                <span className="q-n" aria-hidden="true">{i + 1}</span>
                <div className="grow">
                  <p className="q-text">{q.text}</p>
                  <p className="tiny">Added by {q.by === me ? "you" : nameOf(state, q.by)}{q.hidden ? " · Only Maggie and Sarah see this" : ""}</p>
                </div>
                <div className="q-actions">
                  {isGuardian && <button className="btn plain sm" aria-label="Move up" disabled={i === 0} onClick={() => actions.moveQuestion(appt!.id, q.id, -1)}><ArrowUp size={16} /></button>}
                  {isGuardian && <button className="btn plain sm" aria-label="Move down" disabled={i === list.length - 1} onClick={() => actions.moveQuestion(appt!.id, q.id, 1)}><ArrowDown size={16} /></button>}
                  {isElder && <button className="btn secondary sm" onClick={() => { actions.hideQuestion(appt!.id, q.id, !q.hidden); toast(q.hidden ? "Everyone on the list can see it again" : "Only you and Sarah can see it now"); }}>{q.hidden ? <><Eye size={16} /> Show</> : <><EyeOff size={16} /> Hide</>}</button>}
                  {(q.by === me || isGuardian) && <button className="btn plain sm" aria-label="Remove" onClick={() => { actions.removeQuestion(appt!.id, q.id); toast("Removed"); }}><Trash2 size={16} /></button>}
                </div>
              </li>
            ))}
          </ol>

          <form className="stack panel" style={{ "--gap": "10px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label className="field"><span>Add a question or something you noticed</span>
              <textarea className="input" rows={2} maxLength={QUESTION_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. She's been more tired after lunch" />
            </label>
            <button className="btn" disabled={!text.trim()}><ListChecks size={18} /> Add</button>
            <p className="tiny">Everyone who can see Maggie's visits sees the list{isElder ? ". You can hide an item so only you and Sarah see it." : "."}</p>
          </form>
        </>
      )}

      {hint && <HealthHint text={text.trim()} spotted={hint} canNote={false} onNote={() => undefined} onSend={add} onEdit={() => setHint(null)} sendLabel="Add anyway" intro="Everyone who can see Maggie's visits sees this list. Health details are safer on Maggie's record, where her sharing choices decide who sees them." noNoteText="Edit it to leave the health detail out, or add it anyway." />}
    </div>
  );
}

/** CC-217: the printout. One page, large type, Sarah's order. Hidden items stay off unless Sarah adds them back. */
export function QuestionsPrint() {
  const { state } = useStore();
  const me = meId(state.persona);
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [withHidden, setWithHidden] = useState(false);
  const appt = state.appointments.find((a) => a.id === id);
  const items = printList(state, me, id, withHidden);
  const anyHidden = questionsFor(state, me, id).some((q) => q.hidden);
  if (!appt || (me !== GUARDIAN && me !== ELDER)) return <div className="page narrow"><p className="muted">Nothing to print.</p></div>;
  return (
    <div className="page narrow stack q-print" style={{ "--gap": "16px" } as CSSProperties}>
      <div className="row between no-print">
        <button className="btn ghost" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
        <button className="btn" onClick={() => window.print()}><Printer size={18} /> Print</button>
      </div>
      {anyHidden && me === GUARDIAN && (
        <div className="row no-print"><span className="grow small">Include items Maggie hid</span><Toggle checked={withHidden} onChange={setWithHidden} label="Include items Maggie hid" /></div>
      )}
      <article className="q-sheet" aria-label="Printable question list">
        <h1>Questions for {appt.title}</h1>
        <p className="q-sheet-when">{fmtDay(appt.date)} at {fmtTime(appt.time)}</p>
        <ol>{items.map((q) => <li key={q.id}>{q.text}</li>)}</ol>
        {items.length === 0 && <p>No questions yet.</p>}
      </article>
    </div>
  );
}
