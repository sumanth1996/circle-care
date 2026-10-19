import { useEffect, useRef, useState } from "react";
import { Lock, Users, FileText, Upload, ShieldCheck, Clock3, XCircle, Eye } from "lucide-react";
import { useStore } from "../../data/store";
import { member, nameOf, clock } from "../../data/selectors";
import { Avatar, Segmented, Sheet, useToast } from "../../components/ui";
import { getFile, inspectUpload, putFile } from "../../lib/secureStorage";
import { uid } from "../../lib/time";
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
  const [viewing, setViewing] = useState<CareDoc | null>(null);
  const [uploadError, setUploadError] = useState("");

  // CC-67: check the file's real type and size, encrypt it, then store it on this device.
  const upload = async (f: File) => {
    setUploadError("");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const check = inspectUpload(bytes, f.name);
    if (!check.ok) { setUploadError(check.reason); return; }
    const fileId = uid("file");
    await putFile(fileId, bytes);
    actions.addDoc({ name: f.name, kind, size: `${Math.max(1, Math.round(f.size / 1024))} KB`, fileId, mime: check.mime });
    toast(kind === "Legal authority" ? "Sent for verification" : "Document added");
  };
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
              {d.status === "rejected" && <span className="badge red" title={d.rejectReason}><XCircle size={13} /> Resubmit</span>}
              <button className="btn sm plain" onClick={() => { setViewing(d); actions.docViewed(d.name); }} aria-label={`View ${d.name}`}><Eye size={16} /> View</button>
            </div>
          ))}
        </div>
        {(isGuardian || state.persona === "caregiver") && (
          <div className="panel flat row wrap">
            <select className="input" style={{ width: "auto", minHeight: 40 }} value={kind} onChange={(e) => setKind(e.target.value as CareDoc["kind"])} aria-label="Document type">
              <option>Care plan</option><option>Discharge summary</option>{isGuardian && <option>Legal authority</option>}<option>Other</option>
            </select>
            <button className="btn secondary" onClick={() => file.current?.click()}><Upload size={18} /> Upload</button>
            <input ref={file} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden data-testid="doc-upload" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }} />
            {uploadError && <p role="alert" className="small" style={{ flexBasis: "100%", color: "var(--red)" }}>{uploadError}</p>}
            <p className="hint" style={{ flexBasis: "100%" }}>PDF, PNG or JPEG up to 10 MB. Files are checked, encrypted on this device and shown with the viewer's name watermarked across them. In the full product they're also virus-scanned on our servers.</p>
          </div>
        )}
        {docs.some((d) => d.status === "rejected") && isGuardian && (
          <div className="panel flat small">{docs.filter((d) => d.status === "rejected").map((d) => <p key={d.id}><b>{d.name}</b> couldn't be verified: {d.rejectReason ?? "no reason given"}. Upload a new copy as “Legal authority”.</p>)}</div>
        )}
      </section>
      {viewing && <DocViewer doc={viewing} viewer={nameOf(state, me)} at={clock(state)} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Watermarked viewer (CC-67): every view shows who opened it and when, and is written to the access log. */
function DocViewer({ doc, viewer, at, onClose }: { doc: CareDoc; viewer: string; at: Date; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    if (!doc.fileId) { setMissing(true); return; }
    getFile(doc.fileId).then((buf) => {
      if (!buf) { setMissing(true); return; }
      u = URL.createObjectURL(new Blob([buf], { type: doc.mime }));
      setUrl(u);
    });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [doc]);
  const mark = `${viewer} · ${at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  return (
    <Sheet title={doc.name} onClose={onClose}>
      <div className="doc-view" aria-label={`${doc.name}, watermarked for ${viewer}`}>
        {missing && <div className="doc-sample"><FileText size={40} /><b>{doc.name}</b><span className="small muted">Sample document from the demo data. Files you upload open here.</span></div>}
        {url && doc.mime === "application/pdf" && <iframe src={url} title={doc.name} />}
        {url && doc.mime?.startsWith("image/") && <img src={url} alt={doc.name} />}
        <div className="watermark" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i}>{mark}</span>)}</div>
      </div>
      <p className="tiny" style={{ marginTop: 10 }}>Watermarked for {mark}. This view was added to Maggie's access log.</p>
    </Sheet>
  );
}
