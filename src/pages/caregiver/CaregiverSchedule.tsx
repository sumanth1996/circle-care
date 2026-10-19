import { useState } from "react";
import { Repeat, Check } from "lucide-react";
import { useStore, FAMILY } from "../../data/store";
import { clock, shiftForDay, member, nameOf } from "../../data/selectors";
import { Sheet, useToast, Avatar } from "../../components/ui";
import { fmtShortDay, fmtTime, ymd, addDays } from "../../lib/time";
import type { Shift } from "../../data/types";

/** CC-55 shift swap requests · accept offered shifts. */
export default function CaregiverSchedule() {
  const { state, actions, me } = useStore();
  const toast = useToast();
  const [swap, setSwap] = useState<Shift | null>(null);
  const [to, setTo] = useState(FAMILY);
  const [reason, setReason] = useState("");
  const now = clock(state);
  const offered = state.shifts.filter((s) => s.caregiverId === me && !s.accepted);
  const days = Array.from({ length: 14 }, (_, i) => ymd(addDays(now, i)));
  const others = state.members.filter((m) => (m.role === "pro" || m.role === "family") && m.id !== me && m.status === "active");

  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Next two weeks</p><h1>Your schedule</h1></div></div>

      {offered.map((s) => (
        <div key={s.id} className="panel row wrap" style={{ boxShadow: "0 0 0 2px var(--care), var(--shadow-soft)" }}>
          <div className="grow"><b>New shift offered</b><p className="muted small">{s.days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")} · {fmtTime(s.start)}–{fmtTime(s.end)}</p></div>
          <button className="btn" onClick={() => { actions.acceptShift(s.id); toast("Shift accepted"); }}><Check size={18} /> Accept</button>
        </div>
      ))}

      <div className="list">
        {days.map((d) => {
          const mine = shiftForDay(state, d).filter((s) => s.caregiverId === me && s.accepted);
          return (
            <div key={d} className="list-row">
              <span style={{ width: 110, fontWeight: 600, color: d === ymd(now) ? "var(--blue)" : undefined }}>{d === ymd(now) ? "Today" : fmtShortDay(d)}</span>
              <span className="grow">{mine.length ? mine.map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)}`).join(", ") : <span className="muted">Off</span>}</span>
              {mine[0] && <button className="btn sm plain" onClick={() => setSwap(mine[0])}><Repeat size={15} /> Swap</button>}
            </div>
          );
        })}
      </div>

      {swap && (
        <Sheet title="Ask to swap this shift" onClose={() => setSwap(null)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); actions.requestSwap(swap.id, to, reason); setSwap(null); toast("Request sent to Sarah"); }}>
            <p className="muted">{fmtTime(swap.start)}–{fmtTime(swap.end)}. Sarah approves the final swap.</p>
            <div className="list flat">
              {others.map((m) => (
                <label key={m.id} className="list-row" style={{ cursor: "pointer" }}>
                  <Avatar m={member(state, m.id)} size={36} /><span className="grow">{nameOf(state, m.id)} <span className="list-sub">· {m.relation}</span></span>
                  <input type="radio" name="swap-to" checked={to === m.id} onChange={() => setTo(m.id)} style={{ width: 20, height: 20 }} />
                </label>
              ))}
            </div>
            <div className="field"><label htmlFor="sw-r">Reason</label><input id="sw-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Doctor's appointment" /></div>
            <button className="btn lg block">Send request</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
