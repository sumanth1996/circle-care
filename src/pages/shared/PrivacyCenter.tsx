import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, PauseCircle, ShieldCheck, Eye, FileText, ScanFace, UserMinus, Clock, ShieldAlert, LogOut, Trash2, FolderOpen, KeyRound, HeartPulse, Smile, HandHeart } from "lucide-react";
import { useStore } from "../../data/store";
import { dailyShared } from "../../data/everyday";
import { clock, member, nameOf } from "../../data/selectors";
import { Avatar, Sheet, Toggle, download, useToast } from "../../components/ui";
import { fmtShortDay, fmtTime, relative, addDays } from "../../lib/time";
import type { Member } from "../../data/types";
import Consent from "../elder/Consent";
import { verifyChain, RETENTION_YEARS } from "../../data/audit";
import { helpCandidates, helpFromPeople } from "../../data/help";
import { encryptWithPassphrase, decryptWithPassphrase } from "../../lib/secureStorage";

const access: Record<Member["role"], string> = {
  elder: "Everything",
  guardian: "Everything, and approves big decisions",
  family: "Today's medicines, tasks, notes, alerts and the help requests Sarah shares with them",
  pro: "Today's plan, only during their shifts, and the help requests Sarah shares with them",
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
  const [exporting, setExporting] = useState<"idle" | "verify" | "passphrase">("idle");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [consent, setConsent] = useState(false);
  const now = clock(state);

  useEffect(() => { actions.logView("the Privacy Center"); }, [actions]);

  const since = addDays(now, -30).toISOString();
  const log = useMemo(() => state.audit.filter((a) => a.at >= since && a.actorId !== state.elderId).sort((a, b) => b.at.localeCompare(a.at)), [state.audit, since, state.elderId]);
  const visible = state.members.filter((m) => m.role !== "elder" && m.status !== "revoked");
  const revoked = state.members.filter((m) => m.status === "revoked");

  if (consent) return <Consent review onDone={() => setConsent(false)} />;

  const integrity = useMemo(() => verifyChain(state.audit), [state.audit]);

  // CC-32: the export is encrypted with a passphrase the person chooses (PBKDF2 → AES-256-GCM).
  const doExport = async () => {
    const data = { exportedAt: new Date().toISOString(), note: "Circle Care demo export (fictional data).", circle: state.members.map(({ photo: _p, ...m }) => m), medications: state.meds, doses: state.doses, tasks: state.tasks, checkins: state.checkins, dailyCheckins: isElder || dailyShared(state) ? state.dailyLogs.filter((l) => isElder || !l.private) : [], notes: state.notes, documents: state.docs, accessLog: state.audit };
    const file = await encryptWithPassphrase(JSON.stringify(data, null, 2), pass);
    download(`circle-care-export-${new Date().toISOString().slice(0, 10)}.ccexport`, file);
    actions.exported();
    setExporting("idle");
    setPass(""); setPass2("");
    toast("Encrypted copy downloaded");
  };
  const passOk = pass.length >= 8 && pass === pass2;

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

      <section className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties}>
        <div className="row">
          <HeartPulse size={30} color="var(--red)" style={{ flex: "none" }} />
          <div className="grow"><b>Share health readings with Sarah</b><p className="muted small">Heart rate, blood oxygen, activity and sleep from {isElder ? "your" : "Maggie's"} watch. {state.settings.vitals.shareWithGuardian ? "Only Sarah can see them." : "Not shared right now."}</p></div>
          {isElder ? <Toggle checked={state.settings.vitals.shareWithGuardian} onChange={(v) => { actions.setHealthSharing(v); toast(v ? "Sharing health readings with Sarah" : "Health readings are private"); }} label="Share health readings with Sarah" /> : <span className={`badge ${state.settings.vitals.shareWithGuardian ? "green" : "orange"}`}>{state.settings.vitals.shareWithGuardian ? "Shared" : "Private"}</span>}
        </div>
      </section>

      <section className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties}>
        <div className="row">
          <Smile size={30} color="var(--elder)" style={{ flex: "none" }} />
          <div className="grow"><b>Share daily check-ins with Sarah</b><p className="muted small">How {isElder ? "you feel" : "she feels"}, glasses of water and meals from {isElder ? "your" : "her"} home screen. {!state.settings.dailyLog.shareWithGuardian ? "Not shared right now." : state.settings.sharingPaused ? "Private while sharing is paused." : "Only Sarah can see them. Days logged while not sharing stay private."}</p></div>
          {isElder ? <Toggle checked={state.settings.dailyLog.shareWithGuardian} onChange={(v) => { actions.setDailySharing(v); toast(v ? "Sharing check-ins with Sarah" : "Check-ins are private"); }} label="Share daily check-ins with Sarah" /> : <span className={`badge ${dailyShared(state) ? "green" : "orange"}`}>{!state.settings.dailyLog.shareWithGuardian ? "Private" : state.settings.sharingPaused ? "Paused" : "Shared"}</span>}
        </div>
      </section>

      {/* CC-209: help requests are their own kind of data, with their own sharing rule. */}
      <section className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties} aria-labelledby="pc-help">
        <div className="row">
          <HandHeart size={30} color="var(--blue)" style={{ flex: "none" }} />
          <div className="grow"><b id="pc-help">Help requests</b><p className="muted small">Rides, groceries and visits Sarah asks for, and help {isElder ? "you ask" : "Maggie asks"} for. Only the people picked see each one, and only {isElder ? "you" : "Maggie"} and Sarah see them while sharing is paused. A request for an appointment shows as an appointment only, without the doctor or the reason.</p></div>
          <button className="btn sm secondary" onClick={() => nav(isElder ? "/app/elder/help" : "/app/guardian/help")}>See them</button>
        </div>
        {/* CC-211: who sees the help Maggie asks for herself. Only she chooses. */}
        <div className="stack pc-help-from" style={{ "--gap": "8px" } as React.CSSProperties} role="group" aria-labelledby="pc-help-from">
          <b id="pc-help-from" className="small">Who sees help {isElder ? "you ask" : "Maggie asks"} for</b>
          {helpCandidates(state).map((m) => {
            const on = helpFromPeople(state).includes(m.id);
            return (
              <div key={m.id} className="row">
                <Avatar m={m} size={30} />
                <span className="grow">{m.short} <span className="tiny">{m.relation}</span></span>
                {isElder
                  ? <Toggle checked={on} onChange={(v) => { const cur = helpFromPeople(state); actions.setHelpFrom(v ? [...cur, m.id] : cur.filter((x) => x !== m.id)); toast(v ? `${m.short} will see help you ask for` : `${m.short} won't see help you ask for`); }} label={`${m.short} sees help I ask for`} />
                  : <span className={`badge ${on ? "green" : ""}`}>{on ? "Sees them" : "Doesn't"}</span>}
              </div>
            );
          })}
          <p className="tiny">{isElder ? "Sarah always sees them." : "Only Maggie can change this. You always see them."}</p>
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

      <section className="panel stack" style={{ "--gap": "8px" } as React.CSSProperties} aria-labelledby="integrity">
        <div className="row">
          {integrity.ok ? <ShieldCheck size={28} color="var(--green)" style={{ flex: "none" }} /> : <ShieldAlert size={28} color="var(--red)" style={{ flex: "none" }} />}
          <div className="grow">
            <b id="integrity">{integrity.ok ? "Access log is intact" : "Access log may have been altered"}</b>
            <p className="muted small">{integrity.ok ? `All ${integrity.count} entries check out. Each entry is sealed to the one before it, so any change or deletion would show up here.` : `Entry ${integrity.brokenAt + 1} of ${integrity.count} doesn't match its seal. Our security team is alerted automatically.`}</p>
          </div>
        </div>
        <p className="tiny">In the full product, the access log is kept for {RETENTION_YEARS} years, even after a circle is closed, as health privacy law requires. It records who opened or changed what, and when. It can name a medicine, a document or an appointment, so the log is protected as health information.</p>
      </section>

      <section className="grid-2">
        <button className="panel stack" style={{ "--gap": "8px", border: 0, textAlign: "left", cursor: "pointer" } as React.CSSProperties} onClick={() => setOpening(true)}>
          <FolderOpen size={28} color="var(--blue)" />
          <b>Open a downloaded copy</b>
          <span className="muted small">Check what's inside a .ccexport file using its passphrase.</span>
        </button>
        <button className="panel stack" style={{ "--gap": "8px", border: 0, textAlign: "left", cursor: "pointer" } as React.CSSProperties} onClick={() => { actions.signOutEverywhere(); toast("Signed out on all devices"); nav("/app"); }}>
          <LogOut size={28} color="var(--blue)" />
          <b>Sign out everywhere</b>
          <span className="muted small">Lost a phone? This ends every session and turns off notifications on all devices.</span>
        </button>
      </section>

      <section className="panel flat stack" style={{ "--gap": "6px" } as React.CSSProperties}>
        <b>What Circle Care keeps</b>
        <p className="small muted">{state.meds.length} medicines · {state.doses.length} dose records · {state.notes.length} notes · {state.docs.length} documents · {state.audit.length} access-log entries. Everything is encrypted, and nothing is sold or used for ads.</p>
      </section>

      {(isElder || state.persona === "guardian") && (
        <button className="btn block danger-soft" onClick={() => setClosing(true)}><Trash2 size={18} /> Close this circle and delete its data</button>
      )}

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
            <button className="btn lg block" onClick={() => setExporting("passphrase")}>Confirm with Face ID</button>
          </div>
        </Sheet>
      )}
      {exporting === "passphrase" && (
        <Sheet title="Protect the download" onClose={() => setExporting("idle")}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (passOk) doExport(); }}>
            <p>Choose a passphrase. The file is locked with it, so it's safe even if it's emailed or copied. We can't recover it for you.</p>
            <label className="field"><span>Passphrase (at least 8 characters)</span><input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
            <label className="field"><span>Type it again</span><input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
            {pass2 && pass !== pass2 && <p className="small" style={{ color: "var(--red)" }} role="alert">The passphrases don't match.</p>}
            <button className="btn lg block" disabled={!passOk}><KeyRound size={20} /> Download encrypted copy</button>
          </form>
        </Sheet>
      )}
      {opening && <OpenExport onClose={() => setOpening(false)} />}
      {closing && (
        <Sheet title="Close this circle?" onClose={() => { setClosing(false); setConfirmText(""); }}>
          <div className="stack">
            <p>This deletes Maggie's medicines, notes, documents and schedules, removes everyone's access, and erases the encryption key on this device so no copy can be read.</p>
            <p className="small muted">Download a copy first if you might need it. In the full product, the access log is kept for {RETENTION_YEARS} years as the law requires and protected as health information, backups are purged within 35 days, and you get an email confirming deletion. In this demo, the log is deleted with everything else.</p>
            <label className="field"><span>Type DELETE to confirm</span><input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" /></label>
            <button className="btn lg block danger" disabled={confirmText.trim().toUpperCase() !== "DELETE"} onClick={async () => { nav("/"); await actions.closeCircle(); toast("The circle was closed and its data deleted"); }}><Trash2 size={20} /> Delete everything</button>
            <button className="btn lg block plain" onClick={() => { setClosing(false); setConfirmText(""); }}>Keep the circle</button>
          </div>
        </Sheet>
      )}
      <p className="tiny center">Times shown in your time zone. Last updated {fmtTime(now)}.</p>
    </div>
  );
}

function OpenExport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [result, setResult] = useState<{ ok: true; summary: string[] } | { ok: false } | null>(null);
  const open = async () => {
    try {
      const data = JSON.parse(await decryptWithPassphrase(file!, pass)) as Record<string, unknown[] | string>;
      const count = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0);
      setResult({ ok: true, summary: [`Exported ${new Date(data.exportedAt as string).toLocaleString()}`, `${count("circle")} people in the circle`, `${count("medications")} medicines · ${count("doses")} dose records`, `${count("notes")} notes · ${count("documents")} documents`, `${count("accessLog")} access-log entries`] });
    } catch {
      setResult({ ok: false });
    }
  };
  return (
    <Sheet title="Open a downloaded copy" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (file && pass) open(); }}>
        <label className="field"><span>Export file</span><input className="input" type="file" accept=".ccexport,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); setFile(await f.text()); setResult(null); } }} /></label>
        <label className="field"><span>Passphrase</span><input className="input" type="password" value={pass} onChange={(e) => { setPass(e.target.value); setResult(null); }} /></label>
        <button className="btn lg block" disabled={!file || !pass}>Unlock</button>
        {result?.ok === false && <p role="alert" style={{ color: "var(--red)" }}>That passphrase doesn't open “{name}”.</p>}
        {result?.ok && <div className="panel flat stack" style={{ "--gap": "4px" } as React.CSSProperties} role="status"><b>Unlocked “{name}”</b>{result.summary.map((l) => <span key={l} className="small">{l}</span>)}</div>}
        <p className="tiny">The file is opened only on this device; nothing is uploaded.</p>
      </form>
    </Sheet>
  );
}
