import { useEffect, useState } from "react";
import { Plus, CalendarX2, Clock3 } from "lucide-react";
import { useStore } from "../../data/store";
import { clock, shiftForDay, coverageGaps, lateCheckins, nameOf, member } from "../../data/selectors";
import { Avatar, Sheet, useToast } from "../../components/ui";
import { fmtTime, fmtShortDay, ymd, addDays, dayNames, uid } from "../../lib/time";
import type { Shift } from "../../data/types";
import "./guardian.css";

/** CC-54 recurring shifts · CC-57 late check-in · CC-60 coverage gaps. */
export default function Schedule() {
  const { state, actions } = useStore();
  const toast = useToast();
  const now = clock(state);
  const [edit, setEdit] = useState<Shift | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i));
  const gaps = coverageGaps(state);
  const late = lateCheckins(state);
  const today = state.visits.filter((v) => v.date === ymd(now));

  useEffect(() => { actions.logView("the caregiver schedule"); }, [actions]);

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="page-kicker">Caregivers</p><h1>Schedule</h1></div>
        <button className="btn" onClick={() => setEdit({ id: uid("s"), caregiverId: null, days: [1, 3, 5], start: "17:00", end: "20:00", accepted: false })}><Plus size={18} /> New shift</button>
      </div>

      {late.map((s) => (
        <div key={s.id} className="panel row" style={{ background: "var(--elder-soft)", boxShadow: "none" }}>
          <Clock3 color="var(--elder)" />
          <span className="grow"><b>{nameOf(state, s.caregiverId)} hasn't checked in</b><span className="muted small" style={{ display: "block" }}>The {fmtTime(s.start)} shift started {Math.round((now.getTime() - new Date(`${ymd(now)}T${s.start}:00`).getTime()) / 60000)} minutes ago.</span></span>
          <a className="btn sm" href={`tel:${member(state, s.caregiverId)?.phone.replace(/[^+\d]/g, "")}`}>Call</a>
        </div>
      ))}

      <section className="week" aria-label="Next 7 days">
        {days.map((d, i) => {
          const date = ymd(d);
          return (
            <div key={date} className={`week-day ${i === 0 ? "today" : ""}`}>
              <h3>{i === 0 ? "Today" : `${dayNames[d.getDay()]} ${d.getDate()}`}</h3>
              {shiftForDay(state, date).map((s) => {
                const m = member(state, s.caregiverId);
                const isGap = !s.caregiverId || !s.accepted;
                return (
                  <button key={s.id} className={`shift-chip ${isGap ? "gap" : ""}`} onClick={() => setEdit(structuredClone(s))} style={isGap ? { border: 0, cursor: "pointer", textAlign: "left" } : { border: 0, cursor: "pointer", textAlign: "left", background: `color-mix(in srgb, ${m?.color} 16%, white)`, color: "var(--ink)" }}>
                    {fmtTime(s.start)}–{fmtTime(s.end)}<br />
                    <span style={{ fontWeight: 500 }}>{isGap ? (s.caregiverId ? `${nameOf(state, s.caregiverId)} (not accepted)` : "Uncovered") : m?.short}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </section>

      <div className="grid-2">
        <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <h2 className="section-title">Coverage gaps</h2>
          <div className="list">
            {gaps.slice(0, 6).map((g, i) => (
              <button key={i} className="list-row has-icon" onClick={() => setEdit(structuredClone(g.shift))}>
                <CalendarX2 size={22} color="#9a6700" />
                <span className="grow"><b>{fmtShortDay(g.date)}</b> <span className="muted">· {fmtTime(g.shift.start)}–{fmtTime(g.shift.end)}</span></span>
                <span className="link small">Assign</span>
              </button>
            ))}
            {gaps.length === 0 && <div className="list-row muted">Every shift in the next two weeks is covered.</div>}
          </div>
          {gaps.length > 6 && <p className="tiny">+{gaps.length - 6} more in the next 14 days.</p>}
        </section>
        <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <h2 className="section-title">Visits today</h2>
          <div className="list">
            {today.map((v) => (
              <div key={v.id} className="list-row">
                <Avatar m={member(state, v.caregiverId)} size={36} />
                <span className="grow"><b>{nameOf(state, v.caregiverId)}</b><span className="list-sub" style={{ display: "block" }}>{v.checkIn ? `In ${fmtTime(v.checkIn)}${v.manualReason ? " (manual)" : " · location verified"}` : "Not checked in"}{v.checkOut ? ` · Out ${fmtTime(v.checkOut)}` : ""}</span></span>
                <span className={`badge ${v.checkOut ? "" : v.checkIn ? "green" : "yellow"}`}>{v.checkOut ? "Done" : v.checkIn ? "On shift" : "Expected"}</span>
              </div>
            ))}
            {today.length === 0 && <div className="list-row muted">No visits scheduled today.</div>}
          </div>
        </section>
      </div>

      {edit && <ShiftSheet shift={edit} onClose={() => setEdit(null)} onSave={(s) => { actions.saveShift(s); setEdit(null); toast(s.caregiverId ? `Shift offered to ${nameOf(state, s.caregiverId)}` : "Shift saved"); }} />}
    </div>
  );
}

function ShiftSheet({ shift, onClose, onSave }: { shift: Shift; onClose: () => void; onSave: (s: Shift) => void }) {
  const { state } = useStore();
  const [s, setS] = useState(shift);
  const carers = state.members.filter((m) => (m.role === "pro" || m.role === "family") && m.status === "active");
  return (
    <Sheet title="Shift" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...s, accepted: s.caregiverId === shift.caregiverId ? shift.accepted : false }); }}>
        <div className="field"><span className="label">Repeats on</span>
          <div className="row wrap" style={{ "--gap": "6px" } as React.CSSProperties}>
            {dayNames.map((d, i) => <button type="button" key={d} aria-pressed={s.days.includes(i)} onClick={() => setS({ ...s, days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })} className="btn sm" style={{ background: s.days.includes(i) ? "var(--blue)" : "var(--mist)", color: s.days.includes(i) ? "#fff" : "var(--ink)", minWidth: 52 }}>{d}</button>)}
          </div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="sh-s">Starts</label><input id="sh-s" type="time" className="input" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} /></div>
          <div className="field"><label htmlFor="sh-e">Ends</label><input id="sh-e" type="time" className="input" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="sh-c">Caregiver</label>
          <select id="sh-c" className="input" value={s.caregiverId ?? ""} onChange={(e) => setS({ ...s, caregiverId: e.target.value || null })}>
            <option value="">Not assigned yet</option>
            {carers.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.relation}</option>)}
          </select>
          <span className="hint">The caregiver gets a notification to accept.</span>
        </div>
        <button className="btn lg block" disabled={!s.days.length}>Save shift</button>
      </form>
    </Sheet>
  );
}
