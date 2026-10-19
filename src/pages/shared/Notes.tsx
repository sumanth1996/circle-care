import { useEffect, useRef, useState } from "react";
import { Lock, Users, FileText, Upload, ShieldCheck, Clock3, XCircle } from "lucide-react";
import { useStore } from "../../data/store";
import { member, nameOf, clock } from "../../data/selectors";
import { Avatar, Segmented, useToast } from "../../components/ui";
import { relative, fmtShortDay } from "../../lib/time";
import type { CareDoc } from "../../data/types";

/** CC-66 care notes with visibility · CC-67 secure documents · CC-23 legal document upload. */
export default function Notes() {
  const { state, actions, me } = useStore();
  const toast = useToast();
  const [text, setText] = useState("");
  const [vis, setVis] = useState<"everyone" | "guardian">("everyone");
  const [kind, setKind] = useState<CareDoc["kind"]>("Care plan");
  const file = useRef<HTMLInputElement>(null);
  const isGuardian = state.persona === "guardian";
  // Visibility is enforced here in the demo; production enforces it server-side.
  const notes = state.notes.filter((n) => n.visibility === "everyone" || isGuardian || n.by === me).sort((a, b) => b.at.localeCompare(a.at));
  const docs = state.docs.filter((d) => isGuardian || d.kind !== "Legal authority");

  useEffect(() => { actions.logView("care notes"); }, [actions]);

  return (
    <div className="page narrow stack">
      <div className="page-head"><div><p className="page-kicker">Shared with the circle</p><h1>Notes & documents</h1></div></div>

      <form className="panel stack" style={{ "--gap": "12px" } as React.CSSProperties} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; actions.addNote(text.trim(), vis); setText(""); toast("Note posted"); }}>
        <label htmlFor="note" className="sr-only">New note</label>
        <textarea id="note" className="input" placeholder="Share an update with the circle…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row between wrap">
          <Segmented label="Who can see this note" value={vis} onChange={setVis} options={[{ value: "everyone", label: "Everyone" }, { value: "guardian", label: "Sarah only" }]} />
          <button className="btn" disabled={!text.trim()}>Post note</button>
        </div>
        <p className="hint">{vis === "everyone" ? "Maggie and everyone in her circle will see this." : "Only Sarah will see this. Maggie can see notes about her unless Sarah restricts them for a documented reason."}</p>
      </form>

      <div className="list">
        {notes.map((n) => (
          <div key={n.id} className="list-row" style={{ alignItems: "flex-start" }}>
            <Avatar m={member(state, n.by)} size={40} />
            <div className="grow">
              <div className="row between"><b>{nameOf(state, n.by)}</b><span className="tiny">{relative(n.at, clock(state))}</span></div>
              <p style={{ marginTop: 2 }}>{n.text}</p>
              <span className="tiny">{n.visibility === "everyone" ? <><Users size={12} style={{ verticalAlign: "-2px" }} /> Everyone</> : <><Lock size={12} style={{ verticalAlign: "-2px" }} /> Sarah only</>}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
        <div className="section-head"><h2 className="section-title">Documents</h2></div>
        <div className="list">
          {docs.map((d) => (
            <div key={d.id} className="list-row">
              <span className="icon-tile" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}><FileText size={20} /></span>
              <span className="grow"><span className="list-title" style={{ display: "block" }}>{d.name}</span><span className="list-sub">{d.kind} · {d.size} · {nameOf(state, d.by)}, {fmtShortDay(d.at)}</span></span>
              {d.status === "verified" && <span className="badge green"><ShieldCheck size={13} /> Verified</span>}
              {d.status === "pending" && <span className="badge yellow"><Clock3 size={13} /> In review</span>}
              {d.status === "rejected" && <span className="badge red"><XCircle size={13} /> Resubmit</span>}
            </div>
          ))}
        </div>
        {(isGuardian || state.persona === "caregiver") && (
          <div className="panel flat row wrap">
            <select className="input" style={{ width: "auto", minHeight: 40 }} value={kind} onChange={(e) => setKind(e.target.value as CareDoc["kind"])} aria-label="Document type">
              <option>Care plan</option><option>Discharge summary</option>{isGuardian && <option>Legal authority</option>}<option>Other</option>
            </select>
            <button className="btn secondary" onClick={() => file.current?.click()}><Upload size={18} /> Upload</button>
            <input ref={file} type="file" accept=".pdf,image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              actions.addDoc(f.name, kind, `${Math.max(1, Math.round(f.size / 1024))} KB`);
              toast(kind === "Legal authority" ? "Sent for verification" : "Document added");
              e.target.value = "";
            }} />
            <p className="hint" style={{ flexBasis: "100%" }}>Files are encrypted and virus-scanned; downloads are watermarked with the viewer's name. In this demo only the file name is kept — the file never leaves your device.</p>
          </div>
        )}
      </section>
    </div>
  );
}
