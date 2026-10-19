import { useStore } from "../../data/store";
import { Toggle } from "../../components/ui";

/** CC-63 alert channels & quiet hours · CC-52 check-in window · CC-42 dose escalation timers · CC-14 session lock · CC-50 critical alerts. */
export default function GuardianSettings() {
  const { state, actions } = useStore();
  const s = state.settings;
  const row = { minHeight: 60 };
  return (
    <div className="page narrow stack" style={{ "--gap": "22px" } as React.CSSProperties}>
      <div className="page-head"><div><p className="page-kicker">Sarah</p><h1>Settings</h1></div></div>

      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">How we reach you</h2>
        <div className="list">
          {(["push", "sms", "email"] as const).map((c) => (
            <label key={c} className="list-row" style={row}><span className="grow">{{ push: "Push notifications", sms: "Text messages", email: "Email" }[c]}</span><Toggle checked={s.channels[c]} onChange={(v) => actions.settings({ channels: { ...s.channels, [c]: v } })} label={c} /></label>
          ))}
          <label className="list-row" style={row}><span className="grow">Quiet hours<span className="list-sub" style={{ display: "block" }}>Non-urgent alerts wait until morning</span></span><Toggle checked={s.quietHours.on} onChange={(v) => actions.settings({ quietHours: { ...s.quietHours, on: v } })} label="Quiet hours" /></label>
          {s.quietHours.on && (
            <div className="list-row" style={row}>
              <span className="grow">From</span><input type="time" className="input" style={{ width: 130 }} value={s.quietHours.start} onChange={(e) => actions.settings({ quietHours: { ...s.quietHours, start: e.target.value } })} aria-label="Quiet hours start" />
              <span>to</span><input type="time" className="input" style={{ width: 130 }} value={s.quietHours.end} onChange={(e) => actions.settings({ quietHours: { ...s.quietHours, end: e.target.value } })} aria-label="Quiet hours end" />
            </div>
          )}
          <label className="list-row" style={row}><span className="grow">Emergencies break through silent mode<span className="list-sub" style={{ display: "block" }}>SOS and missed high-priority doses always alert you</span></span><Toggle checked={s.criticalBypass} onChange={(v) => actions.settings({ criticalBypass: v })} label="Critical alerts" /></label>
        </div>
      </section>

      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">Maggie's daily check-in</h2>
        <div className="list">
          <div className="list-row" style={row}>
            <span className="grow">Window</span>
            <input type="time" className="input" style={{ width: 130 }} value={s.checkinWindow.start} onChange={(e) => actions.settings({ checkinWindow: { ...s.checkinWindow, start: e.target.value } })} aria-label="Check-in window start" />
            <span>to</span>
            <input type="time" className="input" style={{ width: 130 }} value={s.checkinWindow.end} onChange={(e) => actions.settings({ checkinWindow: { ...s.checkinWindow, end: e.target.value } })} aria-label="Check-in window end" />
          </div>
        </div>
        <p className="tiny">If Maggie hasn't checked in by the end of the window, you'll get an alert.</p>
      </section>

      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">When a dose isn't confirmed</h2>
        <div className="list">
          <label className="list-row" style={row}><span className="grow">Alert the caregiver after</span><select className="input" style={{ width: 140 }} value={s.doseEscalation.caregiverMin} onChange={(e) => actions.settings({ doseEscalation: { ...s.doseEscalation, caregiverMin: +e.target.value } })}>{[15, 30, 45].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">Alert you after</span><select className="input" style={{ width: 140 }} value={s.doseEscalation.guardianMin} onChange={(e) => actions.settings({ doseEscalation: { ...s.doseEscalation, guardianMin: +e.target.value } })}>{[45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">SOS: next person after</span><select className="input" style={{ width: 140 }} value={s.escalationDelayMin} onChange={(e) => actions.settings({ escalationDelayMin: +e.target.value })}>{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} minute{n > 1 ? "s" : ""}</option>)}</select></label>
        </div>
        <p className="tiny">High-priority medicines escalate twice as fast.</p>
      </section>

      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">Security</h2>
        <div className="list">
          <label className="list-row" style={row}><span className="grow">Lock the app after</span><select className="input" style={{ width: 140 }} value={s.sessionLockMin} onChange={(e) => actions.settings({ sessionLockMin: +e.target.value })}>{[1, 5, 15].map((n) => <option key={n} value={n}>{n} minute{n > 1 ? "s" : ""}</option>)}</select></label>
          <div className="list-row" style={row}><span className="grow">Two-step sign-in</span><span className="badge green">Always on</span></div>
        </div>
      </section>
    </div>
  );
}
