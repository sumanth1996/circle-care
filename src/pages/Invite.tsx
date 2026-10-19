import { useParams, useNavigate, Link } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import { useStore } from "../data/store";
import { member, nameOf } from "../data/selectors";
import { Avatar, useToast } from "../components/ui";
import { fmtDay } from "../lib/time";
import "./welcome.css";

const sees: Record<string, string[]> = {
  pro: ["Today's medications and tasks — only during your shifts", "The hand-off note from the last caregiver", "Maggie's emergency card"],
  family: ["Today's medications, tasks and check-in", "Care notes shared with everyone", "SOS alerts and Maggie's emergency card"],
  guardian: ["Everything family can see, plus approvals", "The weekly digest and activity history", "Guardian permissions after your legal documents are verified"],
};

/** CC-17: accept an invitation in a few taps; expired links can be renewed. */
export default function Invite() {
  const { memberId } = useParams();
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const m = member(state, memberId);
  if (!m) return <main className="auth"><p>This invitation link isn't valid. <Link to="/app">Go to Circle Care</Link></p></main>;
  const expired = m.invitedAt ? Date.now() - new Date(m.invitedAt).getTime() > 72 * 3600000 : false;
  const accepted = m.status === "active";

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="row" style={{ justifyContent: "center", "--gap": "-12px" } as React.CSSProperties}>
          <Avatar m={member(state, "m-sarah")} size={64} />
          <Avatar m={m} size={64} />
        </div>
        <h1 className="t-lg balance">{nameOf(state, "m-sarah")} invited you to Maggie's care circle</h1>
        <p className="muted">You'll join as <b>{m.relation}</b>{m.expiresOn ? `, until ${fmtDay(m.expiresOn)}` : ""}.</p>
        <div className="list flat" style={{ textAlign: "left" }}>
          <div className="list-row"><span className="list-title">What you'll be able to see</span></div>
          {(sees[m.role] ?? sees.family).map((s) => (
            <div key={s} className="list-row"><Check size={20} color="var(--green)" /><span>{s}</span></div>
          ))}
        </div>
        {accepted ? (
          <button className="btn lg block" onClick={() => nav("/app")}>You're in — open Circle Care</button>
        ) : expired ? (
          <>
            <p className="badge yellow" style={{ alignSelf: "center" }}><Clock size={14} /> This invitation expired after 72 hours</p>
            <button className="btn lg block" onClick={() => toast("Request sent to Sarah")}>Ask Sarah for a new link</button>
          </>
        ) : (
          <button className="btn lg block" onClick={() => { actions.acceptInvite(m.id); toast("Welcome to the circle"); }}>Accept invitation</button>
        )}
        <p className="hint">Maggie is notified whenever someone joins her circle.</p>
      </div>
    </main>
  );
}
