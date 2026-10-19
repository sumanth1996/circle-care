import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { useStore } from "../../data/store";
import { dosesFor, tasksFor, todayVisit, checkinToday, clock } from "../../data/selectors";
import { Segmented, useToast } from "../../components/ui";
import { fmtTime } from "../../lib/time";
import "./caregiver.css";

const moods = ["Cheerful", "Calm", "Tired", "Upset"] as const;

/**
 * CC-58 structured end-of-shift hand-off + approved feature "Smart hand-off summary":
 * the draft is written on-device from the shift's check-offs. Nothing is sent until Ana confirms.
 */
export default function CaregiverHandoff() {
  const { state, actions, me } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const visit = todayVisit(state, me);
  const doses = dosesFor(state);
  const tasks = tasksFor(state).filter((t) => t.task.assignee === "caregiver");
  const ci = checkinToday(state);
  const sosToday = state.sos.filter((s) => s.startedAt.slice(0, 10) === clock(state).toISOString().slice(0, 10));

  const draft = useMemo(() => {
    const given = doses.filter((d) => d.state === "taken");
    const notGiven = doses.filter((d) => d.log && d.state !== "taken");
    const openNow = doses.filter((d) => !d.log && d.state !== "upcoming");
    const doneT = tasks.filter((t) => t.done);
    const pendingT = tasks.filter((t) => !t.done);
    const lines = [
      `Medicines: ${given.length} given${given.length ? ` (${given.map((d) => `${d.med.name} ${fmtTime(d.time)}`).join(", ")})` : ""}.`,
      notGiven.length ? `Not given: ${notGiven.map((d) => `${d.med.name} ${fmtTime(d.time)} — ${d.log?.status}${d.log?.reason ? `, “${d.log.reason}”` : ""}`).join("; ")}.` : "",
      openNow.length ? `Still open: ${openNow.map((d) => `${d.med.name} ${fmtTime(d.time)}`).join(", ")}.` : "",
      `Tasks: ${doneT.length} of ${tasks.length} done${pendingT.length ? `; still to do: ${pendingT.map((t) => t.task.title.toLowerCase()).join(", ")}` : ""}.`,
      ci ? `Maggie checked in at ${fmtTime(ci.at)}.` : "Maggie hasn't checked in today.",
      sosToday.length ? `SOS today: ${sosToday.map((s) => s.outcome ?? s.status).join("; ")}.` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }, [doses, tasks, ci, sosToday]);

  const [summary, setSummary] = useState(draft);
  const [mood, setMood] = useState<(typeof moods)[number]>("Cheerful");
  const [meals, setMeals] = useState("");
  const [concerns, setConcerns] = useState("");
  const [notes, setNotes] = useState("");
  const [skip, setSkip] = useState(false);
  const [skipReason, setSkipReason] = useState("");

  if (!visit?.checkIn || visit.checkOut) {
    return <div className="page narrow stack"><p className="muted">You're not on shift right now.</p><button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => nav("/app/caregiver")}>Back to today</button></div>;
  }

  return (
    <div className="page narrow stack">
      <button className="btn ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => nav("/app/caregiver")}><ArrowLeft size={20} /> Today</button>
      <div className="page-head"><div><p className="page-kicker">End of shift</p><h1>Hand-off</h1></div></div>

      <section className="draft stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <div className="row"><Sparkles size={20} color="var(--guard)" /><b className="grow">Drafted from your shift</b><button className="link small" onClick={() => setSummary(draft)}>Redo draft</button></div>
        <label htmlFor="ho-sum" className="sr-only">Summary</label>
        <textarea id="ho-sum" className="input" style={{ minHeight: 150, background: "rgba(255,255,255,0.8)" }} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <p className="tiny">Written on this device from what you checked off. Review and edit before sending.</p>
      </section>

      <div className="panel stack">
        <div className="field"><span className="label">Maggie's mood</span><Segmented label="Mood" value={mood} onChange={setMood} options={moods.map((m) => ({ value: m, label: m }))} /></div>
        <div className="field"><label htmlFor="ho-meals">Meals</label><input id="ho-meals" className="input" value={meals} onChange={(e) => setMeals(e.target.value)} placeholder="e.g. Ate all of lunch, half of breakfast" /></div>
        <div className="field"><label htmlFor="ho-c">Anything to watch?</label><input id="ho-c" className="input" value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="Leave blank if nothing" /></div>
        <div className="field"><label htmlFor="ho-n">Notes for the next caregiver</label><textarea id="ho-n" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      <button className="btn lg block" onClick={() => {
        actions.submitHandoff({ mood, meals: meals || "Not noted", concerns: concerns || "None", notes, summary });
        toast("Hand-off sent — you're checked out");
        nav("/app/caregiver");
      }}>Send hand-off and check out</button>

      {!skip ? <button className="link" style={{ alignSelf: "center" }} onClick={() => setSkip(true)}>Skip the hand-off</button> : (
        <div className="panel flat stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <div className="field"><label htmlFor="ho-skip">Why are you skipping?</label><input id="ho-skip" className="input" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} /></div>
          <button className="btn plain" disabled={!skipReason.trim()} onClick={() => { actions.submitHandoff({ mood, meals: "", concerns: "", notes: "", summary, skippedReason: skipReason.trim() }); toast("Checked out"); nav("/app/caregiver"); }}>Check out without a hand-off</button>
        </div>
      )}
    </div>
  );
}
