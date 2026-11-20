import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2, Check, Clock, X, CheckCircle2, Mic, BellOff } from "lucide-react";
import { useStore } from "../../data/store";
import { nextUp, dosesFor, tasksFor, isOpen, todayOf } from "../../data/selectors";
import { reminderState, SNOOZE_MIN } from "../../data/calmAlerts";
import { PillArt, IconTile, taskIcons, useSpeech, useToast } from "../../components/ui";
import { fmtTime } from "../../lib/time";
import { voiceSupport, voiceMaybe, listenOnce, intentOf } from "../../lib/voice";
import "./elder.css";

/** CC-39 reminder card · CC-40 taken / skipped / refused (the elder's choice is respected) · CC-207 reminder count and snooze. */
export default function ElderNext() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const { speak, supported } = useSpeech();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const n = nextUp(state);
  const [voiceOff, setVoiceOff] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const later = [
    ...dosesFor(state).filter((d) => d.state === "upcoming").map((d) => ({ t: d.time, label: d.med.name })),
    ...tasksFor(state).filter((t) => !t.done).map((t) => ({ t: t.task.time, label: t.task.title })),
  ].sort((a, b) => a.t.localeCompare(b.t)).slice(0, 5);

  const back = () => nav("/app/elder");
  const record = (status: "taken" | "skipped" | "refused", why?: string) => {
    if (n.kind !== "dose") return;
    // The day the dose was due, so a dose from last night settles its own reminders and alerts (CC-199).
    actions.recordDose(n.slot.med.id, n.slot.time, status, why, n.slot.date);
    const msg = status === "taken" ? "Great — marked as taken" : status === "skipped" ? "OK — marked as skipped" : "Got it. Sarah will see your note";
    toast(msg);
    // CC-244: her home shows a large Undo for 10 minutes; say so when Read aloud is on.
    if (state.settings.readAloud) speak(`${msg}. If that was a mistake, tap Undo.`);
    back();
  };

  // CC-73: say "I took it" or "skip" instead of tapping. On-device recognition only.
  const listen = async () => {
    setHeard(null);
    setListening(true);
    if ((await voiceSupport()) !== "on-device") { setVoiceOff(true); setListening(false); return; }
    try {
      const said = await listenOnce().result;
      const intent = intentOf(said);
      if (intent === "unknown") { setHeard(said ? `I heard “${said}”. Please tap a button instead.` : "I didn't catch that. Please tap a button instead."); return; }
      record(intent);
    } catch {
      setHeard("Voice isn't working right now. Please tap a button instead.");
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={back}><ArrowLeft /> Home</button>

      {n.kind === "dose" && (() => {
        const d = n.slot;
        const due = isOpen(d);
        const lastNight = d.date !== todayOf(state);
        const text = `${lastNight ? `This was due last night at ${fmtTime(d.time)}. ` : ""}${d.med.name}, ${d.med.strength}. Take ${d.med.dose}. ${d.med.instructions} This is for your ${d.med.purpose.toLowerCase()}.`;
        const rem = due ? reminderState(state, d.med.id, d.time, d.date) : undefined;
        return (
          <div className="panel stack" style={{ "--gap": "18px", borderRadius: 32, padding: 28 } as React.CSSProperties}>
            <div className="row between">
              <span className={`badge ${due ? "orange" : "blue"}`} style={{ fontSize: "0.7em", height: 30 }}><Clock size={16} /> {lastNight ? "From last night" : due ? "Time to take it" : "Coming up"} · {fmtTime(d.time)}</span>
              {supported && <button className="btn secondary" style={{ width: 52, height: 52, padding: 0 }} aria-label="Read this to me" onClick={() => speak(text)}><Volume2 size={26} /></button>}
            </div>
            <div className="row" style={{ "--gap": "20px" } as React.CSSProperties}>
              <PillArt med={d.med} size={96} />
              <div>
                <h1 style={{ fontSize: "1.9em", lineHeight: 1.05, letterSpacing: "-0.03em" }}>{d.med.name}</h1>
                <p style={{ fontSize: "1.1em", fontWeight: 600 }}>{d.med.strength} · {d.med.dose}</p>
              </div>
            </div>
            {lastNight && <p style={{ fontWeight: 600 }}>Let us know if you took it last night.</p>}
            <p style={{ fontSize: "1.05em" }}>{d.med.instructions}</p>
            <p className="muted">For your {d.med.purpose.toLowerCase()}. Prescribed by {d.med.prescriber}.</p>
            {rem && <p className="muted" role="status" style={{ fontWeight: 600 }}>Reminder {rem.sent} of {rem.limit}{rem.snoozed ? `. Next reminder in ${SNOOZE_MIN} minutes.` : rem.canSnooze ? "" : ". This was the last reminder."}</p>}

            {!refusing ? (
              <div className="big-actions">
                <button className="btn" style={{ background: "var(--green)" }} onClick={() => record("taken")}><Check size={30} /> I took it</button>
                <button className="btn plain" onClick={() => record("skipped")}><Clock size={26} /> Skip this time</button>
                {rem?.canSnooze && !rem.snoozed && <button className="btn plain" onClick={() => { actions.snoozeDose(d.med.id, d.time, d.date); const msg = `OK, I'll remind you again in ${SNOOZE_MIN} minutes`; toast(msg); if (state.settings.readAloud) speak(msg); back(); }}><BellOff size={24} /> Remind me in {SNOOZE_MIN} minutes</button>}
                <button className="btn ghost" style={{ minHeight: 56, color: "var(--muted)" }} onClick={() => setRefusing(true)}><X size={22} /> I don't want to take it</button>
                {voiceMaybe() && !voiceOff && <button className="btn secondary" onClick={listen} disabled={listening} aria-live="polite"><Mic size={24} /> {listening ? "Listening… say “I took it” or “skip”" : "Answer with my voice"}</button>}
                {heard && <p role="status" style={{ fontSize: "0.9em" }}>{heard}</p>}
                {voiceOff && <p role="status" className="muted" style={{ fontSize: "0.75em" }}>Voice answers aren't available on this device without sending your voice to the internet, so we've left them off. Please tap a button.</p>}
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
