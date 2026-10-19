import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Copy, ShieldCheck, Clock3, FileCheck2, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import { useStore } from "../../data/store";
import { member, nameOf } from "../../data/selectors";
import { Avatar, Sheet, Segmented, useToast } from "../../components/ui";
import { fmtShortDay, ymd, addDays } from "../../lib/time";
import type { Member } from "../../data/types";

const roleLabel: Record<Member["role"], string> = { elder: "Elder", guardian: "Legal guardian", family: "Family caregiver", pro: "Professional caregiver" };

/** CC-15/16 create circle & invite by role · CC-18 permission roles · CC-24 guardian verification queue · CC-25 time-bound access · CC-48 escalation order. */
export default function Circle() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [invite, setInvite] = useState(false);
  const legalDocs = state.docs.filter((d) => d.kind === "Legal authority");
  const chain = state.settings.escalation;

  useEffect(() => { actions.logView("the care circle"); }, [actions]);

  const move = (i: number, dir: -1 | 1) => {
    const next = [...chain];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    actions.settings({ escalation: next });
  };

  return (
    <div className="page narrow stack">
      <div className="page-head">
        <div><p className="page-kicker">Maggie's circle</p><h1>Care circle</h1></div>
        <button className="btn" onClick={() => setInvite(true)}><UserPlus size={18} /> Invite someone</button>
      </div>

      <div className="list">
        {state.members.filter((m) => m.status !== "revoked").map((m) => (
          <div key={m.id} className="list-row" style={{ alignItems: "flex-start" }}>
            <Avatar m={m} size={48} />
            <div className="grow">
              <div className="row wrap" style={{ "--gap": "6px" } as React.CSSProperties}>
                <span className="list-title">{m.name}</span>
                <span className={`badge ${m.role === "guardian" ? "purple" : m.role === "elder" ? "orange" : m.role === "pro" ? "teal" : "green"}`}>{roleLabel[m.role]}</span>
                {m.status === "pending" && <span className="badge yellow">Invite sent</span>}
                {m.verification === "verified" && <span className="badge purple"><ShieldCheck size={13} /> Verified</span>}
              </div>
              <p className="list-sub">{m.relation === "You" ? "Maggie" : m.relation}</p>
              {m.expiresOn && <p className="small" style={{ color: "#9a6700" }}><Clock3 size={14} style={{ verticalAlign: "-2px" }} /> Access ends automatically {fmtShortDay(m.expiresOn)}</p>}
            </div>
            {m.status === "pending" && (
              <div className="row" style={{ "--gap": "4px" } as React.CSSProperties}>
                <button className="btn sm plain" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/#/app/invite/${m.id}`); toast("Invite link copied"); }} aria-label={`Copy invite link for ${m.short}`}><Copy size={15} /></button>
                <Link className="btn sm secondary" to={`/app/invite/${m.id}`}><ExternalLink size={15} /> Open</Link>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="tiny">Maggie confirms every member and can remove anyone except her legal guardian from her Privacy Center.</p>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 className="section-title">Who gets SOS alerts first</h2>
        <div className="list">
          {chain.map((id, i) => (
            <div key={id} className="list-row">
              <span className="badge" style={{ width: 28, justifyContent: "center", padding: 0 }}>{i + 1}</span>
              <Avatar m={member(state, id)} size={36} />
              <span className="grow">{nameOf(state, id)} <span className="list-sub">· {i === 0 ? "immediately" : `after ${i * state.settings.escalationDelayMin} min without an answer`}</span></span>
              <button className="btn sm plain" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${nameOf(state, id)} up`}><ArrowUp size={15} /></button>
              <button className="btn sm plain" disabled={i === chain.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${nameOf(state, id)} down`}><ArrowDown size={15} /></button>
            </div>
          ))}
        </div>
        <p className="tiny">Maggie can see this list in her emergency screen.</p>
      </section>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 className="section-title">Legal authority</h2>
        <div className="list">
          {legalDocs.map((d) => (
            <div key={d.id} className="list-row">
              <FileCheck2 size={22} color={d.status === "verified" ? "var(--green)" : "var(--elder)"} />
              <span className="grow"><span className="list-title" style={{ display: "block" }}>{d.name}</span><span className="list-sub">Uploaded by {nameOf(state, d.by)} · {fmtShortDay(d.at)}</span></span>
              {d.status === "pending" ? (
                <span className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
                  <span className="badge yellow">In review</span>
                  <button className="btn sm secondary" onClick={() => { actions.reviewDoc(d.id, true); toast("Verified by review team (demo)"); }}>Simulate approval</button>
                </span>
              ) : <span className={`badge ${d.status === "verified" ? "green" : "red"}`}>{d.status === "verified" ? "Verified" : "Needs resubmission"}</span>}
            </div>
          ))}
        </div>
        <p className="tiny">Until documents are verified, a guardian has family-member access only. Upload new documents in Notes & documents.</p>
      </section>

      {invite && <InviteSheet onClose={() => setInvite(false)} onSend={(m) => { actions.invite(m); setInvite(false); toast(`Invite sent to ${m.name}`); }} />}
    </div>
  );
}

function InviteSheet({ onClose, onSend }: { onClose: () => void; onSend: (m: Pick<Member, "name" | "role" | "relation" | "phone" | "expiresOn">) => void }) {
  const [f, setF] = useState({ name: "", role: "family" as Member["role"], relation: "", phone: "", temporary: false, until: ymd(addDays(new Date(), 14)) });
  return (
    <Sheet title="Invite to Maggie's circle" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSend({ name: f.name.trim(), role: f.role, relation: f.relation || roleLabel[f.role], phone: f.phone, expiresOn: f.temporary ? f.until : undefined }); }}>
        <div className="field"><label htmlFor="iv-n">Name</label><input id="iv-n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="iv-p">Mobile number or email</label><input id="iv-p" className="input" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><span className="label">Role</span>
          <Segmented label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: "family", label: "Family" }, { value: "pro", label: "Professional" }]} />
          <span className="hint">{f.role === "pro" ? "Sees today's plan only during their shifts." : "Sees today's medicines, tasks, notes and alerts."}</span>
        </div>
        <div className="field"><label htmlFor="iv-r">How they're related (optional)</label><input id="iv-r" className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="e.g. Neighbor, Respite caregiver" /></div>
        <label className="row"><input type="checkbox" checked={f.temporary} onChange={(e) => setF({ ...f, temporary: e.target.checked })} style={{ width: 20, height: 20 }} /> Temporary access</label>
        {f.temporary && <div className="field"><label htmlFor="iv-u">Access ends</label><input id="iv-u" type="date" className="input" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></div>}
        <p className="hint">The invite link works once and expires in 72 hours. The message contains no health information. Maggie is notified.</p>
        <button className="btn lg block">Send invite</button>
      </form>
    </Sheet>
  );
}
