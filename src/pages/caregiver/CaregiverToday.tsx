import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, LogIn, LogOut, Check, X, BadgeCheck, Sun, AlertTriangle, ClipboardCheck, Pencil, Lock, MessageSquarePlus } from "lucide-react";
import { useStore } from "../../data/store";
import { clock, dosesFor, tasksFor, todayVisit, member, nameOf, checkinToday, isOpen, type DoseSlot } from "../../data/selectors";
import { Avatar, PillArt, Sheet, IconTile, taskIcons, useToast, Segmented } from "../../components/ui";
import { fmtDay, fmtTime, toMin } from "../../lib/time";
import type { Medication } from "../../data/types";
import "./caregiver.css";

const stateBadge: Record<DoseSlot["state"], [string, string]> = {
  taken: ["green", "Given"], skipped: ["yellow", "Skipped"], refused: ["yellow", "Declined"],
  upcoming: ["", "Later"], due: ["blue", "Due now"], late: ["orange", "Late"], escalated: ["red", "Overdue"],
};

/** Caregiver "Today": CC-38 today's schedule · CC-41 verified doses · CC-45 tasks · CC-56 check-in · CC-59 acknowledge hand-off. */
export default function CaregiverToday() {
  const { state, actions, me } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const now = clock(state);
  const visit = todayVisit(state, me);
  const shift = state.shifts.find((s) => s.id === visit?.shiftId) ?? state.shifts.find((s) => s.caregiverId === me && s.days.includes(now.getDay()));
  const onShift = !!visit?.checkIn && !visit.checkOut;
  const done = !!visit?.checkOut;
  const prevHandoff = [...state.handoffs].filter((h) => h.visitId !== visit?.id).sort((a, b) => b.at.localeCompare(a.at))[0];
  const needsAck = prevHandoff && !prevHandoff.acknowledgedBy && !prevHandoff.skippedReason;
  const doses = dosesFor(state);
  const tasks = tasksFor(state).filter((t) => t.task.assignee === "caregiver" || t.task.assignee === me);
  const [checkInSheet, setCheckInSheet] = useState(false);
  const [notGiven, setNotGiven] = useState<DoseSlot | null>(null);
  const [change, setChange] = useState<Medication | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; title: string } | null>(null);
  const [taskNote, setTaskNote] = useState("");
  const ci = checkinToday(state);
  const shiftDoses = shift ? doses.filter((d) => toMin(d.time) >= toMin(shift.start) - 60 && toMin(d.time) <= toMin(shift.end)) : doses;
  const given = shiftDoses.filter((d) => d.state === "taken").length;

  useEffect(() => { if (onShift) actions.logView("today's care plan"); }, [actions, onShift]);

  return (
    <div className="page stack">
      <div className="page-head">
        <div><p className="page-kicker">{fmtDay(now)}</p><h1>Today with Maggie</h1></div>
        <Avatar m={member(state, state.elderId)} size={56} />
      </div>

      <section className={`shift-card ${onShift ? "on" : ""}`}>
        <div className="grow">
          <p className="small" style={{ fontWeight: 600, opacity: 0.8 }}>{shift ? `Your shift · ${fmtTime(shift.start)}–${fmtTime(shift.end)}` : "No shift scheduled today"}</p>
          <p className="t-md" style={{ color: "inherit" }}>{done ? `Checked out at ${fmtTime(visit!.checkOut!)}` : onShift ? `On shift since ${fmtTime(visit!.checkIn!)}` : "Not checked in"}</p>
          {onShift && <p className="small" style={{ opacity: 0.85 }}>{given} of {shiftDoses.length} doses given this shift</p>}
        </div>
        {!onShift && !done && shift && <button className="btn lg" onClick={() => setCheckInSheet(true)}><LogIn size={20} /> Check in</button>}
        {onShift && <button className="btn lg" style={{ background: "#fff", color: "var(--care)" }} onClick={() => nav("/app/caregiver/handoff")}><LogOut size={20} /> End shift</button>}
      </section>

      {onShift && needsAck && (
        <section className="panel stack" style={{ "--gap": "10px", boxShadow: "0 0 0 2px var(--care), var(--shadow-soft)" } as React.CSSProperties}>
          <div className="row"><ClipboardCheck color="var(--care)" /><b className="grow">Last hand-off from {nameOf(state, prevHandoff.by)}</b><span className="tiny">{fmtDay(prevHandoff.at)}</span></div>
          <p><b>Mood:</b> {prevHandoff.mood} · <b>Meals:</b> {prevHandoff.meals}</p>
          {prevHandoff.concerns && prevHandoff.concerns !== "None" && <p style={{ color: "#9a6700" }}><AlertTriangle size={16} style={{ verticalAlign: "-3px" }} /> {prevHandoff.concerns}</p>}
          <p className="muted">{prevHandoff.notes}</p>
          <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => { actions.acknowledgeHandoff(prevHandoff.id); toast("Hand-off acknowledged"); }}><Check size={18} /> I've read this</button>
        </section>
      )}

      {!onShift ? (
        <div className="panel center stack" style={{ "--gap": "8px", padding: 36 } as React.CSSProperties}>
          <Lock size={36} color="var(--muted)" style={{ margin: "0 auto" }} />
          <h2 className="t-sm">{done ? "Thanks, Ana — your shift is complete" : "Check in to see today's care plan"}</h2>
          <p className="muted small balance" style={{ maxWidth: 420, margin: "0 auto" }}>To protect Maggie's privacy, caregivers see medicines and tasks only during their shifts.</p>
          <Link to="/app/caregiver/schedule" className="link" style={{ marginTop: 6 }}>See your schedule</Link>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>
            <span className={`badge ${ci ? "green" : "yellow"}`}><Sun size={14} /> {ci ? `Maggie checked in at ${fmtTime(ci.at)}` : "Maggie hasn't checked in yet"}</span>
          </div>

          <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <h2 className="section-title">Medicines</h2>
            <div className="list">
              {doses.map((d) => {
                const [tone, label] = stateBadge[d.state];
                const open = isOpen(d);
                return (
                  <div key={d.key} className={`list-row dose-row ${open ? "open" : ""}`}>
                    <PillArt med={d.med} size={44} />
                    <div className="grow">
                      <div className="row wrap" style={{ "--gap": "6px" } as React.CSSProperties}>
                        <span className="list-title">{d.med.name} {d.med.strength}</span>
                        {d.med.critical && <span className="badge red">High priority</span>}
                      </div>
                      <p className="list-sub">{fmtTime(d.time)} · {d.med.dose} · {d.med.instructions}</p>
                      {d.log && <p className="tiny">{d.log.status === "taken" ? "Given" : d.log.status === "skipped" ? "Skipped" : "Declined"} by {nameOf(state, d.log.by)} at {fmtTime(d.log.at)}{d.log.reason ? ` — “${d.log.reason}”` : ""} {d.log.verified && <BadgeCheck size={13} color="var(--care)" style={{ verticalAlign: "-2px" }} />}</p>}
                    </div>
                    <div className="dose-actions">
                      {open ? (
                        <>
                          <button className="btn sm" style={{ background: "var(--green)" }} onClick={() => { actions.recordDose(d.med.id, d.time, "taken"); toast(`${d.med.name} marked as given`); }}><Check size={16} /> Given</button>
                          <button className="btn sm plain" onClick={() => setNotGiven(d)}>Not given</button>
                        </>
                      ) : d.log?.status === "taken" && !d.log.verified ? (
                        <button className="btn sm secondary" onClick={() => { actions.verifyDose(d.med.id, d.time); toast("Verified"); }}><BadgeCheck size={16} /> Verify</button>
                      ) : (
                        <span className={`badge ${tone}`}>{label}</span>
                      )}
                      <button className="btn sm ghost" aria-label={`Request a change to ${d.med.name}`} onClick={() => setChange(d.med)}><Pencil size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <h2 className="section-title">Care tasks</h2>
            <div className="list">
              {tasks.map(({ task, log, overdue }) => (
                <label key={task.id} className="list-row has-icon" style={{ cursor: "pointer" }}>
                  <IconTile icon={taskIcons[task.icon]} color={log ? "var(--green)" : "var(--care)"} />
                  <span className="grow">
                    <span className="list-title" style={{ display: "block", textDecoration: log ? "line-through" : undefined, color: log ? "var(--muted)" : undefined }}>{task.title}</span>
                    <span className="list-sub">{fmtTime(task.time)}{log ? ` · done by ${nameOf(state, log.by)} at ${fmtTime(log.at)}` : overdue ? " · overdue" : ""}</span>
                    {log?.note && <span className="small" style={{ display: "block", marginTop: 2 }}>“{log.note}”</span>}
                  </span>
                  <button type="button" className="btn sm ghost" aria-label={`Add a note to ${task.title}`} onClick={(e) => { e.preventDefault(); setTaskNote(log?.note ?? ""); setNoteFor({ id: task.id, title: task.title }); }}><MessageSquarePlus size={16} /></button>
                  <input type="checkbox" className="check" checked={!!log} onChange={(e) => e.target.checked ? actions.completeTask(task.id) : actions.undoTask(task.id)} aria-label={`${task.title} done`} />
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {checkInSheet && (
        <CheckInSheet onClose={() => setCheckInSheet(false)} onDone={(reason) => { actions.visitCheckIn(reason); setCheckInSheet(false); toast("Checked in — Sarah can see you're here"); }} />
      )}
      {notGiven && (
        <NotGivenSheet slot={notGiven} onClose={() => setNotGiven(null)} onDone={(status, reason) => { actions.recordDose(notGiven.med.id, notGiven.time, status, reason); setNotGiven(null); toast("Recorded"); }} />
      )}
      {noteFor && (
        <Sheet title={noteFor.title} onClose={() => setNoteFor(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); actions.completeTask(noteFor.id, taskNote.trim() || undefined); setNoteFor(null); toast("Done, with your note"); }}>
            <label className="field"><span>Note (optional)</span><textarea className="input" value={taskNote} onChange={(e) => setTaskNote(e.target.value)} placeholder="For example: walked 15 minutes, a bit tired" autoFocus /></label>
            <button className="btn lg block"><Check size={20} /> Mark done</button>
            <p className="tiny">Sarah and Maggie can see task notes.</p>
          </form>
        </Sheet>
      )}
      {change && <ChangeSheet med={change} onClose={() => setChange(null)} onDone={(m, reason) => { actions.requestMedChange(m, reason); setChange(null); toast("Sent to Sarah for approval"); }} />}
    </div>
  );
}

function CheckInSheet({ onClose, onDone }: { onClose: () => void; onDone: (manualReason?: string) => void }) {
  const [mode, setMode] = useState<"gps" | "manual">("gps");
  const [checking, setChecking] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Sheet title="Check in" onClose={onClose}>
      <div className="stack">
        {mode === "gps" ? (
          <>
            <div className="panel flat row"><MapPin color="var(--care)" /><div className="grow"><b>Maggie's home</b><p className="small muted">We check your location once, only at check-in and check-out.</p></div></div>
            <button className="btn lg block" disabled={checking} onClick={() => { setChecking(true); setTimeout(() => onDone(), 900); }}>{checking ? "Confirming location…" : "Check in — I'm here"}</button>
            <button className="link" onClick={() => setMode("manual")}>Location not working? Check in manually</button>
          </>
        ) : (
          <>
            <div className="field"><label htmlFor="ci-reason">Why are you checking in manually?</label><input id="ci-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Phone location is off" /></div>
            <button className="btn lg block" disabled={!reason.trim()} onClick={() => onDone(reason.trim())}>Check in manually</button>
            <p className="hint">Sarah will see that this check-in was manual.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function NotGivenSheet({ slot, onClose, onDone }: { slot: DoseSlot; onClose: () => void; onDone: (s: "skipped" | "refused", reason?: string) => void }) {
  const [status, setStatus] = useState<"skipped" | "refused">("refused");
  const [reason, setReason] = useState("");
  return (
    <Sheet title={`${slot.med.name} not given`} onClose={onClose}>
      <div className="stack">
        <Segmented label="What happened" value={status} onChange={setStatus} options={[{ value: "refused", label: "Maggie declined" }, { value: "skipped", label: "Skipped" }]} />
        <div className="field"><label htmlFor="ng-r">Reason</label><input id="ng-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Said it upsets her stomach" /></div>
        <p className="hint">Maggie's choice is respected. Sarah will see this in the activity feed.</p>
        <button className="btn lg block" onClick={() => onDone(status, reason.trim() || undefined)}>Save</button>
        <button className="btn lg block plain" onClick={onClose}><X size={18} /> Cancel</button>
      </div>
    </Sheet>
  );
}

function ChangeSheet({ med, onClose, onDone }: { med: Medication; onClose: () => void; onDone: (m: Medication, reason: string) => void }) {
  const [times, setTimes] = useState(med.times.join(", "));
  const [dose, setDose] = useState(med.dose);
  const [paused, setPaused] = useState(med.paused);
  const [reason, setReason] = useState("");
  const parsed = times.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t));
  return (
    <Sheet title={`Request a change to ${med.name}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onDone({ ...med, times: parsed, dose, paused }, reason); }}>
        <div className="field"><label htmlFor="cs-t">Times (24-hour, comma separated)</label><input id="cs-t" className="input" value={times} onChange={(e) => setTimes(e.target.value)} /></div>
        <div className="field"><label htmlFor="cs-d">Dose</label><input id="cs-d" className="input" value={dose} onChange={(e) => setDose(e.target.value)} /></div>
        <label className="row"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} style={{ width: 20, height: 20 }} /> Pause this medicine</label>
        <div className="field"><label htmlFor="cs-r">Why?</label><textarea id="cs-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
        <p className="hint">Nothing changes until Sarah approves. Maggie will see the decision.</p>
        <button className="btn lg block" disabled={!parsed.length || !reason.trim()}>Send for approval</button>
      </form>
    </Sheet>
  );
}
