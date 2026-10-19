import { useEffect } from "react";
import { Mail, Flame, LogIn, Pill, AlertTriangle } from "lucide-react";
import { useStore } from "../../data/store";
import { adherenceByDay, checkinStreak, clock, northStar } from "../../data/selectors";
import { Ring } from "../../components/ui";
import { fmtShortDay, ymd, addDays, dayNames } from "../../lib/time";
import "./guardian.css";

/** Approved feature: Weekly family digest. The email version carries no PHI. */
export default function Digest() {
  const { state, actions } = useStore();
  const now = clock(state);
  const days = adherenceByDay(state, 7);
  const totals = days.reduce((a, d) => ({ taken: a.taken + d.taken, total: a.total + d.total }), { taken: 0, total: 0 });
  const pct = totals.total ? Math.round((totals.taken / totals.total) * 100) : 100;
  const from = ymd(addDays(now, -6));
  const visits = state.visits.filter((v) => v.date >= from && v.checkOut).length;
  const streak = checkinStreak(state);
  const notGiven = state.doses.filter((d) => d.date >= from && d.status !== "taken");
  const sos = state.sos.filter((s) => s.startedAt.slice(0, 10) >= from);
  const ns = northStar(state);

  useEffect(() => { actions.logView("the weekly digest"); }, [actions]);

  return (
    <div className="page narrow stack" style={{ "--gap": "22px" } as React.CSSProperties}>
      <div className="page-head"><div><p className="page-kicker">{fmtShortDay(from)} – {fmtShortDay(now)}</p><h1>Maggie's week</h1></div></div>

      <section className="panel row wrap" style={{ "--gap": "24px" } as React.CSSProperties}>
        <Ring value={pct / 100} size={120} stroke={12} color={pct >= 90 ? "var(--green)" : "var(--elder)"}><span style={{ textAlign: "center" }}><b style={{ fontSize: 28, letterSpacing: "-0.03em" }}>{pct}%</b><span className="tiny" style={{ display: "block" }}>doses taken</span></span></Ring>
        <div className="grow stack" style={{ "--gap": "10px", minWidth: 220 } as React.CSSProperties}>
          <div className="row"><Pill size={20} color="var(--green)" /><span><b>{totals.taken} of {totals.total}</b> doses taken</span></div>
          <div className="row"><LogIn size={20} color="var(--care)" /><span><b>{visits}</b> caregiver visits completed</span></div>
          <div className="row"><Flame size={20} color="var(--elder)" /><span><b>{streak}-day</b> check-in streak</span></div>
          <p className="small muted">North Star: <b>{ns}</b> verified care tasks done on time this week.</p>
        </div>
      </section>

      <section className="panel">
        <h2 className="t-sm">Doses taken each day</h2>
        <div className="bars" role="img" aria-label={`Daily adherence: ${days.map((d) => `${dayNames[new Date(d.date + "T12:00").getDay()]} ${d.pct}%`).join(", ")}`}>
          {days.map((d) => (
            <div key={d.date} className="bar">
              <span className="bar-val">{d.pct}%</span>
              <span className={`bar-fill ${d.pct < 90 ? "low" : ""}`} style={{ height: `${Math.max(6, d.pct) * 0.75}%` }} />
              <span className="bar-label">{d.date === ymd(now) ? "Today" : dayNames[new Date(d.date + "T12:00").getDay()]}</span>
            </div>
          ))}
        </div>
      </section>

      {(notGiven.length > 0 || sos.length > 0) && (
        <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <h2 className="section-title">Worth knowing</h2>
          <div className="list">
            {notGiven.map((d) => {
              const med = state.meds.find((m) => m.id === d.medId);
              return <div key={d.id} className="list-row has-icon"><AlertTriangle size={20} color="var(--elder)" /><span className="grow">{med?.name} {d.status} on {fmtShortDay(d.date)}{d.reason ? ` — “${d.reason}”` : ""}</span></div>;
            })}
            {sos.map((s) => <div key={s.id} className="list-row has-icon"><AlertTriangle size={20} color="var(--red)" /><span className="grow">SOS on {fmtShortDay(s.startedAt)}: {s.outcome ?? s.status}</span></div>)}
          </div>
        </section>
      )}

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 className="section-title">The email Sarah receives</h2>
        <div className="email">
          <div className="email-head"><Mail size={16} style={{ verticalAlign: "-3px" }} /> <b>Circle Care</b> · Your weekly update is ready</div>
          <div className="email-body">
            <p>Hi Sarah,</p>
            <p>Maggie's weekly update is ready. This week: <b>{pct}%</b> of scheduled items completed, <b>{visits}</b> visits, and a <b>{streak}-day</b> check-in streak.</p>
            <p>Open Circle Care to see the details.</p>
            <span className="btn sm" style={{ alignSelf: "flex-start" }}>Open Circle Care</span>
            <p className="tiny">To protect Maggie's privacy, this email never includes medicine names, conditions or notes.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
