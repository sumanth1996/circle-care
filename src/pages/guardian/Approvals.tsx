import { useEffect, useState } from "react";
import { Check, X, Pill, UserPlus, Repeat, MessageCircleQuestion } from "lucide-react";
import { useStore } from "../../data/store";
import { member, nameOf, clock } from "../../data/selectors";
import { Avatar, useToast } from "../../components/ui";
import { relative, fmtShortDay } from "../../lib/time";
import type { Approval } from "../../data/types";

const icons = { "med-change": Pill, member: UserPlus, "shift-swap": Repeat };

/** CC-64 approve or decline change requests; the elder is notified of every decision. */
export default function Approvals() {
  const { state, actions } = useStore();
  const pending = state.approvals.filter((a) => a.status === "pending").sort((a, b) => b.at.localeCompare(a.at));
  const done = state.approvals.filter((a) => a.status !== "pending").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const questions = state.approvals.filter((a) => a.elderQuestion);

  useEffect(() => { actions.logView("approval requests"); }, [actions]);

  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Decisions</p><h1>Approvals</h1></div></div>

      {questions.length > 0 && (
        <section className="panel stack" style={{ "--gap": "8px", background: "var(--elder-soft)", boxShadow: "none" } as React.CSSProperties}>
          <div className="row"><MessageCircleQuestion color="var(--elder)" /><b>Maggie has a question</b></div>
          {questions.map((a) => <p key={a.id}><b>About “{a.title}”:</b> {a.elderQuestion}</p>)}
          <a className="btn sm" style={{ alignSelf: "flex-start", background: "var(--elder)" }} href={`tel:${member(state, state.elderId)?.phone.replace(/[^+\d]/g, "")}`}>Call Maggie</a>
        </section>
      )}

      <section className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
        <h2 className="section-title">Waiting for you</h2>
        {pending.length === 0 && <p className="muted">Nothing to approve right now.</p>}
        {pending.map((a) => <Pending key={a.id} a={a} />)}
      </section>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 className="section-title">Decided</h2>
        <div className="list">
          {done.map((a) => {
            const I = icons[a.kind];
            return (
              <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <I size={20} color="var(--muted)" style={{ marginTop: 3 }} />
                <span className="grow">
                  <span className="list-title" style={{ display: "block" }}>{a.title}</span>
                  <span className="list-sub">{a.status === "approved" ? "Approved" : "Declined"} {a.decidedAt && fmtShortDay(a.decidedAt)}{a.note ? ` · “${a.note}”` : ""}</span>
                </span>
                <span className={`badge ${a.status === "approved" ? "green" : ""}`}>{a.elderSeen ? "Maggie saw it" : "Maggie notified"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Pending({ a }: { a: Approval }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [note, setNote] = useState("");
  const I = icons[a.kind];
  return (
    <article className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="icon-tile" style={{ background: "var(--guard)" }}><I size={20} /></span>
        <div className="grow">
          <h3 className="t-sm">{a.title}</h3>
          <div className="row muted small" style={{ "--gap": "6px", marginTop: 4 } as React.CSSProperties}><Avatar m={member(state, a.requestedBy)} size={20} /> Requested by {nameOf(state, a.requestedBy)} · {relative(a.at, clock(state))}</div>
        </div>
      </div>
      <p>{a.detail}</p>
      <input className="input" placeholder="Add a note (optional) — Maggie and the requester will see it" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <div className="row">
        <button className="btn" onClick={() => { actions.decide(a.id, true, note || undefined); toast("Approved — Maggie has been told"); }}><Check size={18} /> Approve</button>
        <button className="btn plain" onClick={() => { actions.decide(a.id, false, note || undefined); toast("Declined"); }}><X size={18} /> Decline</button>
      </div>
    </article>
  );
}
