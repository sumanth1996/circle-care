import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2, Check, Clock, X, CheckCircle2 } from "lucide-react";
import { useStore } from "../../data/store";
import { nextUp, dosesFor, tasksFor, isOpen } from "../../data/selectors";
import { PillArt, IconTile, taskIcons, useSpeech, useToast } from "../../components/ui";
import { fmtTime } from "../../lib/time";
import "./elder.css";

/** CC-39 reminder card · CC-40 taken / skipped / refused (the elder's choice is respected). */
export default function ElderNext() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const { speak, supported } = useSpeech();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const n = nextUp(state);
  const later = [
    ...dosesFor(state).filter((d) => d.state === "upcoming").map((d) => ({ t: d.time, label: d.med.name })),
    ...tasksFor(state).filter((t) => !t.done).map((t) => ({ t: t.task.time, label: t.task.title })),
  ].sort((a, b) => a.t.localeCompare(b.t)).slice(0, 5);

  const back = () => nav("/app/elder");
  const record = (status: "taken" | "skipped" | "refused", why?: string) => {
    if (n.kind !== "dose") return;
    actions.recordDose(n.slot.med.id, n.slot.time, status, why);
    const msg = status === "taken" ? "Great — marked as taken" : status === "skipped" ? "OK — marked as skipped" : "Got it. Sarah will see your note";
    toast(msg);
    if (state.settings.readAloud) speak(msg);
    back();
  };

  return (
    <div className="page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={back}><ArrowLeft /> Home</button>

      {n.kind === "dose" && (() => {
        const d = n.slot;
        const due = isOpen(d);
        const text = `${d.med.name}, ${d.med.strength}. Take ${d.med.dose}. ${d.med.instructions} This is for your ${d.med.purpose.toLowerCase()}.`;
        return (
          <div className="panel stack" style={{ "--gap": "18px", borderRadius: 32, padding: 28 } as React.CSSProperties}>
            <div className="row between">
              <span className={`badge ${due ? "orange" : "blue"}`} style={{ fontSize: "0.7em", height: 30 }}><Clock size={16} /> {due ? "Time to take it" : "Coming up"} · {fmtTime(d.time)}</span>
              {supported && <button className="btn secondary" style={{ width: 52, height: 52, padding: 0 }} aria-label="Read this to me" onClick={() => speak(text)}><Volume2 size={26} /></button>}
            </div>
            <div className="row" style={{ "--gap": "20px" } as React.CSSProperties}>
              <PillArt med={d.med} size={96} />
              <div>
                <h1 style={{ fontSize: "1.9em", lineHeight: 1.05, letterSpacing: "-0.03em" }}>{d.med.name}</h1>
                <p style={{ fontSize: "1.1em", fontWeight: 600 }}>{d.med.strength} · {d.med.dose}</p>
              </div>
            </div>
            <p style={{ fontSize: "1.05em" }}>{d.med.instructions}</p>
            <p className="muted">For your {d.med.purpose.toLowerCase()}. Prescribed by {d.med.prescriber}.</p>

            {!refusing ? (
              <div className="big-actions">
                <button className="btn" style={{ background: "var(--green)" }} onClick={() => record("taken")}><Check size={30} /> I took it</button>
                <button className="btn plain" onClick={() => record("skipped")}><Clock size={26} /> Skip this time</button>
                <button className="btn ghost" style={{ minHeight: 56, color: "var(--muted)" }} onClick={() => setRefusing(true)}><X size={22} /> I don't want to take it</button>
              </div>
            ) : (
              <div className="stack">
                <p style={{ fontWeight: 600 }}>That's your choice. Would you like to tell Sarah why? (optional)</p>
                <textarea className="input" style={{ fontSize: "inherit" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: it upsets my stomach" />
                <div className="big-actions">
                  <button className="btn" onClick={() => record("refused", reason || undefined)}>Send</button>
                  <button className="btn plain" onClick={() => setRefusing(false)}>Go back</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {n.kind === "task" && (
        <div className="panel stack" style={{ "--gap": "18px", borderRadius: 32, padding: 28 } as React.CSSProperties}>
          <span className="badge blue" style={{ fontSize: "0.7em", height: 30, alignSelf: "flex-start" }}><Clock size={16} /> {fmtTime(n.task.time)}</span>
          <div className="row" style={{ "--gap": "18px" } as React.CSSProperties}>
            <IconTile icon={taskIcons[n.task.icon] ?? CheckCircle2} color="var(--care)" size={80} />
            <h1 style={{ fontSize: "1.7em", lineHeight: 1.1 }}>{n.task.title}</h1>
          </div>
          <div className="big-actions">
            <button className="btn" style={{ background: "var(--green)" }} onClick={() => { actions.completeTask(n.task.id); toast("Nice work!"); back(); }}><Check size={30} /> Done</button>
          </div>
        </div>
      )}

      {n.kind === "none" && <div className="panel center"><CheckCircle2 size={56} color="var(--green)" style={{ margin: "0 auto" }} /><h1 className="t-lg" style={{ marginTop: 12 }}>You're all done for today</h1></div>}

      {later.length > 0 && (
        <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <h2 style={{ fontSize: "1.1em" }}>Later today</h2>
          <div className="list">
            {later.map((l) => <div key={l.t + l.label} className="list-row"><span style={{ width: "5.2em", fontWeight: 600, color: "var(--muted)" }}>{fmtTime(l.t)}</span><span>{l.label}</span></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
