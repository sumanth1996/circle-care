import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, MessageCircleQuestion } from "lucide-react";
import { useStore } from "../../data/store";
import { nameOf } from "../../data/selectors";
import { fmtShortDay } from "../../lib/time";
import { useToast } from "../../components/ui";
import "./elder.css";

/** CC-65: the elder sees every decision made about her care, and can ask a question. */
export default function ElderDecisions() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [asking, setAsking] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const decided = state.approvals.filter((a) => a.status !== "pending").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const pending = state.approvals.filter((a) => a.status === "pending");

  useEffect(() => { actions.logView("decisions about her care"); }, [actions]);

  return (
    <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      <h1 style={{ fontSize: "1.8em" }}>Updates about your care</h1>
      {pending.length > 0 && <p className="muted">Sarah is looking at {pending.length} {pending.length === 1 ? "request" : "requests"}. You'll see what she decides here.</p>}
      {decided.map((a) => (
        <article key={a.id} className="panel stack" style={{ "--gap": "10px", boxShadow: a.elderSeen === false ? "0 0 0 3px var(--elder), var(--shadow-soft)" : undefined } as React.CSSProperties}>
          <div className="row">
            {a.status === "approved" ? <CheckCircle2 color="var(--green)" size={30} /> : <XCircle color="var(--muted)" size={30} />}
            <span className="grow" style={{ fontWeight: 700 }}>{a.title}</span>
            {a.elderSeen === false && <span className="badge orange">New</span>}
          </div>
          <p>{nameOf(state, "m-sarah")} {a.status === "approved" ? "said yes" : "said no"} on {fmtShortDay(a.decidedAt!)}. {a.requestedBy !== "m-sarah" && `${nameOf(state, a.requestedBy)} asked for this.`}</p>
          {a.note && <p className="muted">“{a.note}”</p>}
          {a.elderQuestion && <p className="small">You asked: “{a.elderQuestion}”</p>}
          {asking === a.id ? (
            <div className="stack">
              <textarea className="input" style={{ fontSize: "inherit" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your question for Sarah" autoFocus />
              <div className="row"><button className="btn lg" disabled={!q.trim()} onClick={() => { actions.elderAsk(a.id, q.trim()); setAsking(null); setQ(""); toast("Sent to Sarah"); }}>Send to Sarah</button><button className="btn lg plain" onClick={() => setAsking(null)}>Cancel</button></div>
            </div>
          ) : (
            <div className="row wrap">
              {a.elderSeen === false && <button className="btn lg" onClick={() => actions.elderSeen(a.id)}>OK, got it</button>}
              <button className="btn lg secondary" onClick={() => setAsking(a.id)}><MessageCircleQuestion size={22} /> I have a question</button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
