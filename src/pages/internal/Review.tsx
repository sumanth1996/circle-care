import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, ShieldCheck, XCircle, Clock3 } from "lucide-react";
import { useStore } from "../../data/store";
import { nameOf, clock } from "../../data/selectors";
import { fmtShortDay, relative } from "../../lib/time";
import { Sheet, useToast } from "../../components/ui";
import { Logo } from "../../components/Logo";
import type { CareDoc } from "../../data/types";
import "./internal.css";

const REASONS = ["The name doesn't match the guardian's name", "The document is unreadable or cut off", "It isn't signed or certified by a court", "It has expired", "It's the wrong type of document"];

/**
 * CC-24: Trust & Safety review of guardianship / power-of-attorney documents.
 * Reviewers see only the legal documents queue, nothing else about the elder.
 */
export default function Review() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<CareDoc | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const legal = state.docs.filter((d) => d.kind === "Legal authority").sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || b.at.localeCompare(a.at));
  const now = clock(state);

  return (
    <div className="internal">
      <header className="internal-top">
        <Link to="/app" className="row" style={{ "--gap": "8px" } as React.CSSProperties}><ArrowLeft size={18} /> Demo</Link>
        <span className="row" style={{ "--gap": "8px" } as React.CSSProperties}><Logo size={22} /><b>Review team</b></span>
        <span className="badge">Internal</span>
      </header>
      <main className="page narrow stack">
        <div><p className="page-kicker">Trust &amp; Safety</p><h1>Legal authority review</h1>
          <p className="muted">Check that each guardianship or power-of-attorney document is genuine, current and names the person who uploaded it. Target: a decision within one business day. Reviewers can open only these documents; every decision is logged.</p></div>
        <div className="list">
          {legal.map((d) => (
            <div key={d.id} className="list-row" style={{ alignItems: "flex-start" }}>
              <span className="icon-tile" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><FileText size={20} /></span>
              <div className="grow">
                <b>{d.name}</b>
                <p className="list-sub">Uploaded by {nameOf(state, d.by)} · {fmtShortDay(d.at)} ({relative(d.at, now)})</p>
                {d.status === "rejected" && <p className="small" style={{ color: "var(--red)" }}>Rejected: {d.rejectReason}</p>}
              </div>
              {d.status === "pending" ? (
                <div className="row wrap" style={{ "--gap": "8px", justifyContent: "flex-end" } as React.CSSProperties}>
                  <button className="btn sm" onClick={() => { actions.reviewDoc(d.id, true); toast("Verified — the guardian and Maggie were told"); }}><ShieldCheck size={16} /> Verify</button>
                  <button className="btn sm danger-soft" onClick={() => { setRejecting(d); setReason(REASONS[0]); }}><XCircle size={16} /> Reject</button>
                </div>
              ) : d.status === "verified" ? <span className="badge green"><ShieldCheck size={13} /> Verified</span> : d.status === "rejected" ? <span className="badge red">Rejected</span> : <span className="badge"><Clock3 size={13} /> —</span>}
            </div>
          ))}
          {legal.length === 0 && <div className="list-row muted">No documents waiting.</div>}
        </div>
      </main>
      {rejecting && (
        <Sheet title="Reject this document?" onClose={() => setRejecting(null)}>
          <div className="stack">
            <p>{nameOf(state, rejecting.by)} will be asked to upload a new copy. Choose the reason they'll see.</p>
            <div className="stack" role="radiogroup" aria-label="Reason" style={{ "--gap": "6px" } as React.CSSProperties}>
              {REASONS.map((r) => <label key={r} className="row" style={{ "--gap": "10px" } as React.CSSProperties}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>)}
            </div>
            <button className="btn lg block danger" onClick={() => { actions.reviewDoc(rejecting.id, false, reason); setRejecting(null); toast("Rejected — the guardian was asked to resubmit"); }}>Reject and notify</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
