import { useState } from "react";
import { useStore } from "../../data/store";
import { Toggle, Sheet, useToast } from "../../components/ui";
import { member, nameOf } from "../../data/selectors";
import { fmtShortDay } from "../../lib/time";

/** CC-63 alert channels & quiet hours · CC-52 check-in window · CC-42 dose escalation timers · CC-14 session lock · CC-50 critical alerts. */
export default function GuardianSettings() {
  const { state, actions } = useStore();
  const s = state.settings;
  const row = { minHeight: 60 };
  const toast = useToast();
  const [behalf, setBehalf] = useState(false);
  const [why, setWhy] = useState("");
  const verified = member(state, state.members.find((m) => m.role === "guardian")?.id ?? "")?.verification === "verified";
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

      <section id="health" className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">Health readings</h2>
        <div className="list">
          <label className="list-row" style={row}><span className="grow">New reading every<span className="list-sub" style={{ display: "block" }}>From Maggie's watch</span></span><select className="input" style={{ width: 140 }} value={s.vitals.intervalMin} onChange={(e) => actions.settings({ vitals: { ...s.vitals, intervalMin: +e.target.value } })}>{[15, 30, 60].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">Alert if heart rate is above</span><select className="input" style={{ width: 140 }} value={s.vitals.thresholds.hrHigh} onChange={(e) => actions.settings({ vitals: { ...s.vitals, thresholds: { ...s.vitals.thresholds, hrHigh: +e.target.value } } })}>{[100, 110, 120, 130].map((n) => <option key={n} value={n}>{n} bpm</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">…or below (while awake)</span><select className="input" style={{ width: 140 }} value={s.vitals.thresholds.hrLow} onChange={(e) => actions.settings({ vitals: { ...s.vitals, thresholds: { ...s.vitals.thresholds, hrLow: +e.target.value } } })}>{[40, 45, 50, 55].map((n) => <option key={n} value={n}>{n} bpm</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">Sudden heart-rate change<span className="list-sub" style={{ display: "block" }}>Between two readings</span></span><select className="input" style={{ width: 140 }} value={s.vitals.thresholds.hrJump} onChange={(e) => actions.settings({ vitals: { ...s.vitals, thresholds: { ...s.vitals.thresholds, hrJump: +e.target.value } } })}>{[15, 20, 25, 30, 40].map((n) => <option key={n} value={n}>{n}+ bpm</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">Alert if blood oxygen is below</span><select className="input" style={{ width: 140 }} value={s.vitals.thresholds.spo2Low} onChange={(e) => actions.settings({ vitals: { ...s.vitals, thresholds: { ...s.vitals.thresholds, spo2Low: +e.target.value } } })}>{[88, 90, 92, 94].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
          <label className="list-row" style={row}><span className="grow">Sudden oxygen drop</span><select className="input" style={{ width: 140 }} value={s.vitals.thresholds.spo2Drop} onChange={(e) => actions.settings({ vitals: { ...s.vitals, thresholds: { ...s.vitals.thresholds, spo2Drop: +e.target.value } } })}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}+ points</option>)}</select></label>
        </div>
        <p className="tiny">Ask Maggie's doctor what range is right for her. Maggie decides whether readings are shared with you — {s.vitals.shareWithGuardian ? "she's sharing them now" : "she has turned sharing off"}.</p>
      </section>

      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">Security</h2>
        <div className="list">
          <label className="list-row" style={row}><span className="grow">Lock the app after</span><select className="input" style={{ width: 140 }} value={s.sessionLockMin} onChange={(e) => actions.settings({ sessionLockMin: +e.target.value })}>{[1, 5, 15].map((n) => <option key={n} value={n}>{n} minute{n > 1 ? "s" : ""}</option>)}</select></label>
          <div className="list-row" style={row}><span className="grow">Two-step sign-in</span><span className="badge green">Always on</span></div>
        </div>
      </section>
      <section className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <h2 className="section-title">Maggie's agreement</h2>
        <div className="panel flat small">
          {s.consent ? <p>Version {s.consent.version} agreed {fmtShortDay(s.consent.at)} by {nameOf(state, s.consent.by)}{s.consent.onBehalfReason ? ` on Maggie's behalf — “${s.consent.onBehalfReason}”` : ""}.</p> : <p>Maggie hasn't agreed to how her information is shared yet.</p>}
          <p className="muted" style={{ marginTop: 6 }}>If Maggie can't review the agreement herself, you can accept it for her as her verified legal guardian. Your reason is recorded and Maggie can see it.</p>
        </div>
        <button className="btn secondary" style={{ alignSelf: "flex-start" }} disabled={!verified} onClick={() => setBehalf(true)}>Agree on Maggie's behalf</button>
        {!verified && <p className="tiny">Available once your legal authority is verified.</p>}
      </section>
      {behalf && (
        <Sheet title="Agree on Maggie's behalf" onClose={() => setBehalf(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (why.trim().length < 10) return; actions.acceptConsent(why.trim()); setBehalf(false); setWhy(""); toast("Recorded"); }}>
            <p>Only do this if Maggie can't take part herself. She'll still be able to read the agreement, see who agreed and change her privacy choices.</p>
            <label className="field"><span>Why is Maggie unable to agree herself?</span><textarea className="input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="At least 10 characters" /></label>
            <button className="btn lg block" disabled={why.trim().length < 10}>Agree as her guardian</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
