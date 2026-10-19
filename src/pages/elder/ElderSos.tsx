import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Check, Loader2, MessageSquare } from "lucide-react";
import { useStore } from "../../data/store";
import { activeSos, member, nameOf } from "../../data/selectors";
import { Avatar, useSpeech } from "../../components/ui";
import { fmtTime } from "../../lib/time";
import "./elder.css";

const HOLD_MS = 2000;
const CANCEL_S = 10;

/** CC-46 hold-to-send SOS with 10-second cancel · CC-47 call 911 · SMS fallback when offline. */
export default function ElderSos() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const { speak } = useSpeech();
  const sos = activeSos(state);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const raf = useRef<number>(0);
  const start = useRef(0);

  const release = () => { cancelAnimationFrame(raf.current); if (count === null) setProgress(0); };
  const press = () => {
    start.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start.current) / HOLD_MS);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else { setCount(CANCEL_S); if (state.settings.readAloud) speak("Sending for help in 10 seconds. Tap cancel if you're OK."); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      actions.sosStart(navigator.onLine ? "app" : "sms-fallback");
      setCount(null);
      setProgress(0);
      if (state.settings.readAloud) speak("Help is on the way. Your family has been told.");
      return;
    }
    const t = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(t);
  }, [count, actions, speak, state.settings.readAloud]);

  const disclaimer = <p className="tiny center" style={{ fontSize: "0.65em" }}>Circle Care alerts your family and caregivers. It is not a monitored emergency service — call 911 if you are in danger.</p>;

  if (sos) {
    const responder = member(state, sos.responderId);
    return (
      <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
        <div className="panel center stack" style={{ "--gap": "12px", borderRadius: 32, background: sos.status === "acknowledged" ? "var(--green-soft)" : "var(--red-soft)" } as React.CSSProperties}>
          {sos.status === "acknowledged" && responder ? (
            <>
              <div style={{ display: "grid", placeItems: "center" }}><Avatar m={responder} size={96} /></div>
              <h1 style={{ fontSize: "1.8em", lineHeight: 1.1 }}>{responder.short} is coming</h1>
              <p className="muted">Stay where you are if you can. {responder.short} answered at {fmtTime(sos.acknowledgedAt!)}.</p>
            </>
          ) : (
            <>
              <Loader2 size={56} color="var(--red)" style={{ margin: "0 auto", animation: "spin 1.4s linear infinite" }} />
              <h1 style={{ fontSize: "1.8em", lineHeight: 1.1 }}>Help is on the way</h1>
              <p className="muted">We're telling your family now{sos.via === "sms-fallback" ? " by text message" : ""}.</p>
            </>
          )}
        </div>
        <div className="panel">
          <h2 style={{ fontSize: "1em", marginBottom: 6 }}>Who we're telling</h2>
          <div className="chain">
            {state.settings.escalation.map((id, i) => {
              const m = member(state, id);
              const st = sos.responderId === id ? "Coming" : i <= sos.step ? "Alerted" : `In ${(i - sos.step) * state.settings.escalationDelayMin} min if no answer`;
              return (
                <div key={id} className="chain-row">
                  <Avatar m={m} size={48} />
                  <span className="grow"><b>{m?.short}</b><span className="muted" style={{ display: "block", fontSize: "0.8em" }}>{st}</span></span>
                  {(sos.responderId === id || i <= sos.step) && <Check color={sos.responderId === id ? "var(--green)" : "var(--muted)"} />}
                </div>
              );
            })}
          </div>
        </div>
        <a href="tel:911" className="btn xl block danger"><Phone size={28} /> Call 911</a>
        {sos.status === "acknowledged" && <button className="btn lg block plain" onClick={() => { actions.sosResolve(`Resolved by Maggie — ${nameOf(state, sos.responderId)} arrived.`); nav("/app/elder"); }}>I'm OK now</button>}
        {disclaimer}
      </div>
    );
  }

  return (
    <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      {count === null ? (
        <>
          <h1 className="center" style={{ fontSize: "1.6em" }}>Press and hold for help</h1>
          <button className="hold" onPointerDown={press} onPointerUp={release} onPointerLeave={release} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) press(); }} onKeyUp={release} aria-label="Press and hold for 2 seconds to send SOS">
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /></svg>
            SOS
          </button>
          <p className="muted center">Hold for 2 seconds. Your family and Ana will be told where you are.</p>
          <a href="tel:911" className="btn xl block danger-soft"><Phone size={28} /> Call 911</a>
          {!navigator.onLine && <p className="small center"><MessageSquare size={16} style={{ verticalAlign: "-3px" }} /> No internet — SOS will be sent by text message.</p>}
        </>
      ) : (
        <div className="stack center" style={{ "--gap": "18px", paddingTop: 24 } as React.CSSProperties}>
          <p style={{ fontSize: "1.2em", fontWeight: 600 }}>Sending for help in</p>
          <div className="count" aria-live="assertive">{count}</div>
          <button className="btn xl block plain" onClick={() => { setCount(null); setProgress(0); speak("Cancelled. No one was alerted."); }}>Cancel — I'm OK</button>
          <button className="btn xl block danger" onClick={() => setCount(0)}>Send now</button>
        </div>
      )}
      {disclaimer}
    </div>
  );
}
