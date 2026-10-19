import { useState } from "react";
import { Link } from "react-router-dom";
import { Siren, Phone, MapPin, CheckCircle2, Navigation } from "lucide-react";
import { useStore } from "../../data/store";
import { activeSos, member, nameOf, clock } from "../../data/selectors";
import { Avatar, useToast } from "../../components/ui";
import { fmtTime, relative } from "../../lib/time";

/** CC-49: acknowledge an SOS ("I'm responding"), then resolve it with an outcome note. */
export default function SosResponder() {
  const { state, actions, me } = useStore();
  const toast = useToast();
  const sos = activeSos(state);
  const [outcome, setOutcome] = useState("");
  const elder = member(state, state.elderId);
  const past = state.sos.filter((e) => e.status === "resolved").sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (!sos) {
    return (
      <div className="page narrow stack">
        <div className="panel center stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <CheckCircle2 size={48} color="var(--green)" style={{ margin: "0 auto" }} />
          <h1 className="t-lg">No active SOS</h1>
          <p className="muted">Maggie is OK. If she presses SOS, you'll get an alert that breaks through silent mode.</p>
          <Link to={`/app/${state.persona}`} className="btn" style={{ alignSelf: "center" }}>Back to today</Link>
        </div>
        {past.length > 0 && (
          <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
            <h2 className="section-title">Past alerts</h2>
            <div className="list">
              {past.map((e) => <div key={e.id} className="list-row" style={{ alignItems: "flex-start" }}><Siren size={20} color="var(--muted)" /><span className="grow"><b>{new Date(e.startedAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</b> · {nameOf(state, e.responderId)} responded<span className="list-sub" style={{ display: "block" }}>{e.outcome}</span></span></div>)}
            </div>
          </section>
        )}
      </div>
    );
  }

  const mine = sos.responderId === me;
  return (
    <div className="page narrow stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <div className="panel stack" style={{ "--gap": "12px", background: "var(--red)", color: "#fff", borderRadius: 32 } as React.CSSProperties}>
        <div className="row"><Avatar m={elder} size={64} /><div><h1 className="t-lg" style={{ color: "#fff" }}>Maggie needs help</h1><p style={{ opacity: 0.9 }}>Pressed SOS at {fmtTime(sos.startedAt)} · {relative(sos.startedAt, clock(state))}</p></div></div>
        <p className="row" style={{ "--gap": "8px" } as React.CSSProperties}><MapPin size={18} /> At home · 412 Elizabeth St, Noe Valley, San Francisco (demo address)</p>
      </div>

      {sos.status === "active" ? (
        <>
          <button className="btn xl block" style={{ background: "var(--green)" }} onClick={() => { actions.sosAcknowledge(); toast("Maggie will see you're coming"); }}><Navigation size={26} /> I'm on my way</button>
          <a href={`tel:${elder?.phone.replace(/[^+\d]/g, "")}`} className="btn lg block secondary"><Phone size={22} /> Call Maggie</a>
        </>
      ) : (
        <div className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties}>
          <p><b>{mine ? "You're" : `${nameOf(state, sos.responderId)} is`} responding</b> since {fmtTime(sos.acknowledgedAt!)}. Escalation has stopped.</p>
          <div className="field"><label htmlFor="sos-out">What happened? (required to close)</label><textarea id="sos-out" className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. She slipped but wasn't hurt. Helped her up and stayed for an hour." /></div>
          <button className="btn lg block" disabled={!outcome.trim()} onClick={() => { actions.sosResolve(outcome.trim()); toast("SOS closed"); }}>Mark resolved</button>
        </div>
      )}
      <a href="tel:911" className="btn lg block danger-soft"><Phone size={22} /> Call 911</a>

      <section className="panel">
        <h2 className="t-sm" style={{ marginBottom: 6 }}>Escalation</h2>
        {state.settings.escalation.map((id, i) => (
          <div key={id} className="list-row" style={{ padding: "10px 0" }}>
            <Avatar m={member(state, id)} size={36} />
            <span className="grow">{nameOf(state, id)}</span>
            <span className={`badge ${sos.responderId === id ? "green" : i <= sos.step ? "red" : ""}`}>{sos.responderId === id ? "Responding" : i <= sos.step ? "Alerted" : "Next"}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
