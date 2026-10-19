import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, PauseCircle, ShieldCheck, Eye, FileText, ScanFace, UserMinus, Clock } from "lucide-react";
import { useStore } from "../../data/store";
import { clock, member, nameOf } from "../../data/selectors";
import { Avatar, Sheet, Toggle, download, useToast } from "../../components/ui";
import { fmtShortDay, fmtTime, relative, addDays } from "../../lib/time";
import type { Member } from "../../data/types";
import Consent from "../elder/Consent";

const access: Record<Member["role"], string> = {
  elder: "Everything",
  guardian: "Everything, and approves big decisions",
  family: "Today's medicines, tasks, notes and alerts",
  pro: "Today's plan, only during their shifts",
};

/**
 * Approved feature: Privacy Center. Also delivers CC-20 (who can see my data), CC-21 (revoke),
 * CC-29 (access history), CC-32 (export my data).
 */
export default function PrivacyCenter() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const isElder = state.persona === "elder";
  const [revoke, setRevoke] = useState<Member | null>(null);
  const [exporting, setExporting] = useState<"idle" | "verify" | "ready">("idle");
  const [consent, setConsent] = useState(false);
  const now = clock(state);

  useEffect(() => { actions.logView("the Privacy Center"); }, [actions]);

  const since = addDays(now, -30).toISOString();
  const log = useMemo(() => state.audit.filter((a) => a.at >= since && a.actorId !== state.elderId).sort((a, b) => b.at.localeCompare(a.at)), [state.audit, since, state.elderId]);
  const visible = state.members.filter((m) => m.role !== "elder" && m.status !== "revoked");
  const revoked = state.members.filter((m) => m.status === "revoked");

  if (consent) return <Consent review onDone={() => setConsent(false)} />;

  const doExport = () => {
    const data = { exportedAt: new Date().toISOString(), note: "Circle Care demo export (fictional data).", circle: state.members.map(({ photo: _p, ...m }) => m), medications: state.meds, doses: state.doses, tasks: state.tasks, checkins: state.checkins, notes: state.notes, accessLog: state.audit };
    download(`circle-care-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    actions.exported();
    setExporting("idle");
    toast("Your data was downloaded");
  };

  return (
    <div className="page narrow stack" style={{ "--gap": "22px" } as React.CSSProperties}>
      {isElder && <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>}
      <div className="page-head"><div><p className="page-kicker">Privacy Center</p><h1>{isElder ? "Your information, your choice" : "Maggie's privacy"}</h1></div></div>

      <section className="panel stack" style={{ "--gap": "12px", background: state.settings.sharingPaused ? "var(--elder-soft)" : undefined } as React.CSSProperties}>
        <div className="row">
          <PauseCircle size={30} color="var(--elder)" style={{ flex: "none" }} />
          <div className="grow"><b>Pause sharing</b><p className="muted small">{state.settings.sharingPaused ? "Sharing is paused. Only SOS alerts go out." : "Stops sharing with family and caregivers. SOS still works."}</p></div>
          {isElder ? <Toggle checked={state.settings.sharingPaused} onChange={(v) => { actions.settings({ sharingPaused: v }); toast(v ? "Sharing paused" : "Sharing is back on"); }} label="Pause sharing" /> : <span className={`badge ${state.settings.sharingPaused ? "orange" : "green"}`}>{state.settings.sharingPaused ? "Paused" : "On"}</span>}
        </div>
      </section>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <h2 className="section-title">Who can see {isElder ? "your" : "her"} information</h2>
        <div className="list">
          {visible.map((m) => (
            <div key={m.id} className="list-row" style={{ alignItems: "flex-start" }}>
              <Avatar m={m} size={48} />
              <div className="grow">
                <div className="row wrap" style={{ "--gap": "6px" } as React.CSSProperties}>
                  <span className="list-title">{m.name}</span>
                  {m.status === "pending" && <span className="badge yellow">Invited</span>}
                  {m.role === "guardian" && m.verification === "verified" && <span className="badge purple"><ShieldCheck size={13} /> Verified guardian</span>}
                </div>
                <p className="list-sub">{m.relation}</p>
                <p className="small" style={{ marginTop: 4 }}><Eye size={14} style={{ verticalAlign: "-2px" }} /> {access[m.role]}</p>
                {m.expiresOn && <p className="small" style={{ color: "#9a6700" }}><Clock size={14} style={{ verticalAlign: "-2px" }} /> Access ends {fmtShortDay(m.expiresOn)}</p>}
              </div>
              {isElder && m.role !== "guardian" && <button className="btn sm danger-soft" onClick={() => setRevoke(m)}>Remove</button>}
            </div>
          ))}
        </div>
        {isElder && <p className="tiny">Sarah is your legal guardian. Her access can only be changed through the legal process, not in the app.</p>}
        {revoked.length > 0 && <p className="tiny">No longer has access: {revoked.map((m) => m.name).join(", ")}.</p>}
      </section>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <div className="section-head"><h2 className="section-title">Who looked at {isElder ? "your" : "her"} information</h2><span className="tiny">Last 30 days</span></div>
        <div className="list">
          {log.slice(0, 12).map((a) => (
            <div key={a.id} className="list-row">
              {member(state, a.actorId) ? <Avatar m={member(state, a.actorId)} size={36} /> : <span className="avatar" style={{ width: 36, height: 36 }}><ShieldCheck size={18} /></span>}
              <span className="grow"><b>{a.actorId === "system" ? "Circle Care" : a.actorId === "trust-safety" ? "Circle Care review team" : nameOf(state, a.actorId)}</b> {a.action} {a.resource}</span>
              <span className="tiny" title={new Date(a.at).toLocaleString()}>{relative(a.at, now)}</span>
            </div>
          ))}
          {log.length === 0 && <div className="list-row muted">No one has looked at anything yet.</div>}
        </div>
      </section>

      <section className="grid-2">
        <button className="panel stack" style={{ "--gap": "8px", border: 0, textAlign: "left", cursor: "pointer" } as React.CSSProperties} onClick={() => setExporting("verify")}>
          <Download size={28} color="var(--blue)" />
          <b>Download {isElder ? "my" : "Maggie's"} data</b>
          <span className="muted small">Medicines, doses, notes, check-ins and the access log.</span>
        </button>
        <button className="panel stack" style={{ "--gap": "8px", border: 0, textAlign: "left", cursor: "pointer" } as React.CSSProperties} onClick={() => isElder ? setConsent(true) : toast("Maggie agreed to version 1.0")}>
          <FileText size={28} color="var(--blue)" />
          <b>What {isElder ? "I" : "Maggie"} agreed to</b>
          <span className="muted small">Version {state.settings.consent?.version}, {state.settings.consent && fmtShortDay(state.settings.consent.at)}.</span>
        </button>
      </section>

      <section className="panel flat stack" style={{ "--gap": "6px" } as React.CSSProperties}>
        <b>What Circle Care keeps</b>
        <p className="small muted">{state.meds.length} medicines · {state.doses.length} dose records · {state.notes.length} notes · {state.docs.length} documents · {state.audit.length} access-log entries. Everything is encrypted, and nothing is sold or used for ads.</p>
      </section>

      {revoke && (
        <Sheet title={`Remove ${revoke.short}?`} onClose={() => setRevoke(null)}>
          <div className="stack">
            <p>{revoke.short} will stop seeing your information right away, on every device. Sarah will be told.</p>
            <button className="btn lg block danger" onClick={() => { actions.revoke(revoke.id); setRevoke(null); toast(`${revoke.short} was removed`); }}><UserMinus size={20} /> Remove {revoke.short}</button>
            <button className="btn lg block plain" onClick={() => setRevoke(null)}>Keep {revoke.short}</button>
          </div>
        </Sheet>
      )}
      {exporting === "verify" && (
        <Sheet title="Confirm it's you" onClose={() => setExporting("idle")}>
          <div className="stack center">
            <ScanFace size={56} color="var(--blue)" style={{ margin: "0 auto" }} />
            <p>Downloading health information needs a quick check. The file is saved only to this device.</p>
            <button className="btn lg block" onClick={doExport}>Confirm with Face ID</button>
            <p className="tiny">In the full product, larger exports are prepared within 24 hours and password-protected.</p>
          </div>
        </Sheet>
      )}
      <p className="tiny center">Times shown in your time zone. Last updated {fmtTime(now)}.</p>
    </div>
  );
}
