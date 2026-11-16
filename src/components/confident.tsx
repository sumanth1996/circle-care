import { useEffect, useId, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BedDouble, Camera, CheckCircle2, Lightbulb, Phone, Plane, ShieldAlert, ShieldQuestion, StickyNote, Trash2, Volume2 } from "lucide-react";
import { useStore } from "../data/store";
import { currentQuiet, meId, member, nameOf, todayOf } from "../data/selectors";
import { quietLine, quietMaxDay } from "../data/quietDays";
import { AID_MAX, AIDS_AT_ONCE, aidPage, aidsDue, aidWhen, canSeeAids, looksLikeCode, type AidInput } from "../data/memoryAids";
import { SCAM_CHECKLIST, SCAM_KINDS, SCAM_NOTE_MAX, elderScams, hasGuardian, openScams, scamAnswer, scamGuardians, scamSentLine, tipCard, tipProgress } from "../data/scams";
import { can, roleOf } from "../data/policy";
import { ELDER } from "../data/demo";
import type { MemoryAid, ScamKind, ScamReport } from "../data/types";
import { getFile } from "../lib/secureStorage";
import { storePhoto } from "../lib/photos";
import { fmtShortDay, fmtTime, ymd } from "../lib/time";
import { Toggle, useSpeech, useToast } from "./ui";
import "./sprint22.css";

const telOf = (phone?: string) => `tel:${(phone ?? "").replace(/[^+\d]/g, "")}`;
/** "Fri, Dec 4 at 3:02 PM" */
const fmtWhen = (iso: string) => `${fmtShortDay(new Date(iso))} at ${fmtTime(new Date(iso))}`;

/** A photo from the device's encrypted file store. */
export function StoredPhoto({ id, alt, size = 120 }: { id: string; alt: string; size?: number }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let gone = false;
    let made: string | undefined;
    getFile(id).then((buf) => {
      if (gone || !buf) return;
      made = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
      setUrl(made);
    }).catch(() => {});
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  if (!url) return <div className="cc22-photo empty" style={{ width: size, height: size }} aria-hidden="true" />;
  return <img className="cc22-photo" src={url} alt={alt} width={size} height={size} />;
}

/** Picks a photo, prepares it (square, metadata removed) and stores it. */
function PhotoPicker({ value, onChange, label }: { value?: string; onChange: (id?: string) => void; label: string }) {
  const id = useId();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ "--gap": "8px" } as CSSProperties}>
      <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
        {value && <StoredPhoto id={value} alt="The photo you picked" size={72} />}
        <label htmlFor={id} className="btn secondary cc22-file"><Camera size={18} /> {busy ? "Preparing photo" : value ? "Change photo" : label}</label>
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setError(undefined);
          const r = await storePhoto(f);
          setBusy(false);
          if ("error" in r) setError(r.error); else onChange(r.id);
        }} />
        {value && <button type="button" className="btn plain" onClick={() => onChange(undefined)}>Remove photo</button>}
      </div>
      {error && <p className="small cc22-error" role="alert">{error}</p>}
    </div>
  );
}

/* ---------------- CC-129: resting and away days ---------------- */

/** Maggie's home: "Resting today", "Away until…", and "I'm back" while one is on. */
export function ElderQuietDays() {
  const { state, actions } = useStore();
  const toast = useToast();
  const q = currentQuiet(state);
  const today = todayOf(state);
  const [picking, setPicking] = useState(false);
  const [until, setUntil] = useState("");
  const max = quietMaxDay(state);

  if (q) {
    return (
      <section className="panel cc22-quiet on" aria-label="Resting or away">
        {q.kind === "resting" ? <BedDouble size={36} aria-hidden="true" /> : <Plane size={36} aria-hidden="true" />}
        <div className="grow">
          <b>{q.kind === "resting" ? "You're resting today" : q.until === today ? "You're away today" : `You're away until ${fmtShortDay(q.until)}`}</b>
          <p className="muted small" style={{ margin: 0 }}>Your family won't be asked about check-ins. Medicine and SOS still work as usual.</p>
        </div>
        <button className="btn lg" onClick={() => { actions.endQuiet(); toast("Welcome back. Check-ins are on again"); }}>I'm back</button>
      </section>
    );
  }
  return (
    <section className="panel stack cc22-quiet" style={{ "--gap": "12px" } as CSSProperties} aria-label="Resting or away">
      <p style={{ margin: 0 }}><b>Taking a quiet day?</b> <span className="muted small">Your family won't worry about a missed check-in. You don't need to say why.</span></p>
      <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
        <button className="btn secondary lg" onClick={() => { actions.setQuiet("resting"); toast("Resting today. Sarah has been told"); }}><BedDouble size={22} /> Resting today</button>
        {!picking && <button className="btn secondary lg" onClick={() => setPicking(true)}><Plane size={22} /> Away until…</button>}
      </div>
      {picking && (
        <form className="row wrap" style={{ "--gap": "10px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); if (!until) return; actions.setQuiet("away", until); setPicking(false); toast(`Away until ${fmtShortDay(until)}. Sarah has been told`); }}>
          <label className="stack" style={{ "--gap": "4px" } as CSSProperties}>
            <span className="small">Back on</span>
            <input type="date" className="input" min={today} max={max} value={until} onChange={(e) => setUntil(e.target.value)} required />
          </label>
          <button className="btn lg" type="submit" disabled={!until}>Save</button>
          <button className="btn plain" type="button" onClick={() => setPicking(false)}>Cancel</button>
        </form>
      )}
    </section>
  );
}

/** What Sarah and the family see instead of missed check-in alerts. */
export function QuietNotice() {
  const { state } = useStore();
  const q = currentQuiet(state);
  if (!q) return null;
  return (
    <section className="panel cc22-quiet-notice" aria-label="Maggie's quiet day" role="status">
      {q.kind === "resting" ? <BedDouble size={28} aria-hidden="true" /> : <Plane size={28} aria-hidden="true" />}
      <div className="grow">
        <b>{quietLine(state, q)}</b>
        <p className="muted small" style={{ margin: 0 }}>Check-in reminders are paused. Medicine and SOS alerts still come to you.</p>
      </div>
    </section>
  );
}

/* ---------------- CC-138, CC-139: memory aids ---------------- */

/** Maggie's home: notes that are due, large, read aloud once, with Read again and Got it. More than 3 rotate. */
export function ElderMemoryAids() {
  const { state, actions } = useStore();
  const { speak, supported } = useSpeech();
  const [page, setPage] = useState(0);
  const { once, always } = aidsDue(state);
  const shown = [...once, ...aidPage(always, page)];
  const readAloud = state.settings.readAloud && supported;
  const first = shown.find((a) => !a.spokenAt);

  // CC-139 criterion 1: each note is read aloud once, the first time it shows. Silent when read-aloud is off.
  useEffect(() => {
    if (!first || !readAloud) return;
    speak(`A note from ${nameOf(state, first.by)}. ${first.text}`);
    actions.spokeAid(first.id);
  }, [first?.id, readAloud]);

  if (!shown.length) return null;
  return (
    <section className="stack cc22-aids" style={{ "--gap": "14px" } as CSSProperties} aria-label="Notes from your family">
      {shown.map((a) => (
        <article key={a.id} className="panel cc22-aid" aria-label={`Note from ${nameOf(state, a.by)}`}>
          {a.photoId && <StoredPhoto id={a.photoId} alt={`Photo with the note from ${nameOf(state, a.by)}`} size={112} />}
          <div className="grow stack" style={{ "--gap": "10px" } as CSSProperties}>
            <p className="cc22-aid-from"><StickyNote size={18} aria-hidden="true" /> From {nameOf(state, a.by)}</p>
            <p className="cc22-aid-text">{a.text}</p>
            <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
              {readAloud && <button className="btn secondary lg" onClick={() => speak(a.text)}><Volume2 size={22} /> Read again</button>}
              <button className="btn lg" onClick={() => actions.seeAid(a.id)}>Got it</button>
            </div>
          </div>
        </article>
      ))}
      {always.length > AIDS_AT_ONCE && <button className="btn secondary lg" onClick={() => setPage((p) => p + 1)}>More notes</button>}
    </section>
  );
}

/** Maggie's Settings: every note, with a switch to turn any of them off (CC-138 criterion 4). */
export function ElderAidSettings() {
  const { state, actions } = useStore();
  const aids = state.memoryAids ?? [];
  return (
    <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-label="Notes from family">
      <h2 style={{ fontSize: "1.3em", margin: 0 }}>Notes from family</h2>
      {aids.length === 0 ? <p className="muted">No notes yet.</p> : (
        <div className="list">
          {aids.map((a) => (
            <label key={a.id} className="list-row" style={{ minHeight: 72 }}>
              <span className="grow"><span style={{ fontWeight: 600, display: "block" }}>{a.text}</span><span className="muted" style={{ fontSize: "0.8em", display: "block" }}>From {nameOf(state, a.by)} · {aidWhen(a)}</span></span>
              <Toggle checked={!a.offAt} onChange={(v) => actions.setAidOn(a.id, v)} label={`Show the note "${a.text}"`} />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

const blankAid = (): AidInput => ({ text: "", kind: "always" });

/** Sarah's and the family's Memory aids page. Caregivers on shift read them. */
export function MemoryAidsPage() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const me = meId(state.persona);
  const canWrite = can(state, me, "write", "memoryAids");
  const [form, setForm] = useState<AidInput>(blankAid);
  const [editing, setEditing] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const today = todayOf(state);

  if (!canSeeAids(state, me)) {
    return (
      <div className="page narrow stack" style={{ "--gap": "16px" } as CSSProperties}>
        <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
        <h1>Memory aids</h1>
        <p className="muted">You can read Maggie's notes while you're on shift.</p>
      </div>
    );
  }

  const text = form.text.trim();
  const code = looksLikeCode(text);
  const tooLong = form.text.length > AID_MAX;
  const needsWhen = form.kind === "once" && (!form.date || !form.time);
  const ok = !!text && !code && !tooLong && !needsWhen;
  const mine = (a: MemoryAid) => a.by === me || roleOf(state, me) === "guardian";

  const submit = () => {
    setTried(true);
    if (!ok) return;
    if (editing) { actions.editAid(editing, { ...form, text }); toast("Note updated"); }
    else { actions.addAid({ ...form, text }); toast("Note added to Maggie's home"); }
    setForm(blankAid()); setEditing(null); setTried(false);
  };

  return (
    <div className="page narrow stack" style={{ "--gap": "18px" } as CSSProperties}>
      <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
      <div className="page-head"><div><p className="page-kicker">Memory aids</p><h1>Notes for Maggie</h1></div></div>
      <p className="muted small">Short notes show large on Maggie's home and are read aloud once. Never put a PIN, door code or password in a note: anyone near her phone could see it.</p>

      {canWrite && (
        <form className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-label={editing ? "Change note" : "New note"} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="stack" style={{ "--gap": "6px" } as CSSProperties}>
            <label htmlFor="aid-text"><b>Note</b></label>
            <textarea id="aid-text" className="input" rows={2} maxLength={AID_MAX + 20} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Your keys are in the blue bowl by the door." aria-describedby="aid-count" />
            <span id="aid-count" className={`small ${tooLong ? "cc22-error" : "muted"}`}>{form.text.length} of {AID_MAX} characters</span>
          </div>
          {code && <p className="small cc22-error" role="alert">This looks like a PIN, door code or password. Please leave it out of the note.</p>}
          <fieldset className="cc22-when">
            <legend className="small"><b>When</b></legend>
            <label className="row" style={{ "--gap": "8px" } as CSSProperties}><input type="radio" name="aid-kind" checked={form.kind === "always"} onChange={() => setForm({ ...form, kind: "always", date: undefined, time: undefined })} /> Always on her home</label>
            <label className="row" style={{ "--gap": "8px" } as CSSProperties}><input type="radio" name="aid-kind" checked={form.kind === "once"} onChange={() => setForm({ ...form, kind: "once", date: form.date ?? today, time: form.time ?? "15:00" })} /> Once, at a date and time</label>
            {form.kind === "once" && (
              <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
                <label className="stack" style={{ "--gap": "4px" } as CSSProperties}><span className="small">Date</span><input type="date" className="input" min={today} value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                <label className="stack" style={{ "--gap": "4px" } as CSSProperties}><span className="small">Time</span><input type="time" className="input" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
              </div>
            )}
          </fieldset>
          <PhotoPicker value={form.photoId} onChange={(id) => setForm({ ...form, photoId: id })} label="Add a photo" />
          {tried && !text && <p className="small cc22-error" role="alert">Write a short note first.</p>}
          <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
            <button className="btn" type="submit">{editing ? "Save changes" : "Add note"}</button>
            {editing && <button className="btn plain" type="button" onClick={() => { setEditing(null); setForm(blankAid()); setTried(false); }}>Cancel</button>}
          </div>
        </form>
      )}
      {!canWrite && <p className="small muted" role="note">You can read these notes while you're on shift. Sarah and the family write them.</p>}

      <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-label="Notes on Maggie's home">
        <h2 className="section-title">On Maggie's home</h2>
        {(state.memoryAids ?? []).length === 0 && <p className="muted">No notes yet.</p>}
        {(state.memoryAids ?? []).map((a) => (
          <article key={a.id} className="panel cc22-aid-row">
            {a.photoId && <StoredPhoto id={a.photoId} alt="Photo with this note" size={56} />}
            <div className="grow">
              <b>{a.text}</b>
              <p className="muted small" style={{ margin: 0 }}>{aidWhen(a)} · from {nameOf(state, a.by)}{a.offAt ? " · Maggie turned this off" : ""}</p>
              {a.seenAt && <p className="small cc22-seen" style={{ margin: 0 }}><CheckCircle2 size={14} aria-hidden="true" /> Seen at {fmtTime(new Date(a.seenAt))}{ymd(new Date(a.seenAt)) !== today ? ` on ${fmtShortDay(new Date(a.seenAt))}` : ""}</p>}
            </div>
            {canWrite && mine(a) && (
              <div className="row" style={{ "--gap": "6px" } as CSSProperties}>
                <button className="btn secondary" onClick={() => { setEditing(a.id); setForm({ text: a.text, kind: a.kind, date: a.date, time: a.time, photoId: a.photoId }); window.scrollTo({ top: 0 }); }} aria-label={`Change the note "${a.text}"`}>Change</button>
                <button className="btn plain" onClick={() => { actions.removeAid(a.id); toast("Note removed"); }} aria-label={`Remove the note "${a.text}"`}><Trash2 size={18} /></button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

/* ---------------- CC-132 – CC-134: scam help ---------------- */

/** Maggie's home: the "Is this a scam?" tile. */
export function ElderScamTile() {
  return (
    <Link to="/app/elder/scam" className="elder-tile cc22-scam-tile">
      <ShieldQuestion size={56} aria-hidden="true" />
      <span className="grow"><span className="v" style={{ display: "block" }}>Is this a scam?</span><span className="s" style={{ display: "block" }}>A call, text, email or visitor</span></span>
    </Link>
  );
}

/** Maggie's home: reports she sent. Open ones remind her what to do; resolved ones show Sarah's answer once. */
export function ElderScamUpdates() {
  const { state, actions } = useStore();
  const list = elderScams(state);
  if (!list.length) return null;
  return (
    <section className="stack" style={{ "--gap": "12px" } as CSSProperties} aria-label="Scam checks">
      {list.map((r) => r.status === "open" ? (
        <article key={r.id} className="panel cc22-scam-open">
          <ShieldAlert size={30} aria-hidden="true" />
          <p className="grow" style={{ margin: 0 }}><b>{scamSentLine(state)}</b></p>
        </article>
      ) : (
        <article key={r.id} className="panel cc22-scam-safe">
          <CheckCircle2 size={30} aria-hidden="true" />
          <p className="grow" style={{ margin: 0 }}><b>{scamAnswer(state, r)}</b></p>
          <button className="btn lg" onClick={() => actions.seeScamAnswer(r.id)}>OK</button>
        </article>
      ))}
    </section>
  );
}

/** Maggie: "Is this a scam?" Pick what it was, optionally add a note or photo, and send it to Sarah. */
export function ElderScamPage() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const [kind, setKind] = useState<ScamKind>();
  const [note, setNote] = useState("");
  const [photoId, setPhotoId] = useState<string>();
  const [sent, setSent] = useState(false);
  const g = scamGuardians(state)[0];

  if (sent) {
    return (
      <div className="page stack" style={{ "--gap": "20px" } as CSSProperties}>
        <section className="panel stack cc22-sent" style={{ "--gap": "16px" } as CSSProperties} role="status" aria-label="Report sent">
          <ShieldAlert size={48} aria-hidden="true" />
          <p className="cc22-sent-line">{scamSentLine(state)}</p>
          {g ? <a href={telOf(g.phone)} className="btn lg block"><Phone size={22} /> Call {g.short}</a> : <p>If someone is on the phone now, hang up.</p>}
          <button className="btn secondary lg block" onClick={() => nav("/app/elder")}>Back to home</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page stack" style={{ "--gap": "18px" } as CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      <h1 style={{ fontSize: "1.8em" }}>Is this a scam?</h1>
      <p className="muted">{hasGuardian(state) ? `Tell us what it was. ${g!.short} will be told straight away.` : "Tell us what it was. Then hang up and call someone you trust."}</p>
      <div className="stack" role="radiogroup" aria-label="What was it?" style={{ "--gap": "10px" } as CSSProperties}>
        {SCAM_KINDS.map((k) => (
          <button key={k.kind} role="radio" aria-checked={kind === k.kind} className={`list-row cc22-kind ${kind === k.kind ? "on" : ""}`} onClick={() => setKind(k.kind)}>
            <span className="grow">{k.label}</span>
            {kind === k.kind && <span className="badge blue">Selected</span>}
          </button>
        ))}
      </div>
      {kind && (
        <>
          <label className="stack" style={{ "--gap": "6px" } as CSSProperties}>
            <span>Anything to add? <span className="muted small">(optional)</span></span>
            <textarea className="input" rows={2} maxLength={SCAM_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="They said they were from my bank." />
          </label>
          <PhotoPicker value={photoId} onChange={setPhotoId} label="Add a photo (optional)" />
          <button className="btn lg block cc22-send" onClick={() => { actions.reportScam({ kind, note: note.trim() || undefined, photoId }); setSent(true); }}>{g ? `Tell ${g.short}` : "Send"}</button>
        </>
      )}
    </div>
  );
}

/** Sarah's home: reports waiting for her. */
export function GuardianScams() {
  const { state } = useStore();
  const open = openScams(state);
  if (!open.length) return null;
  return (
    <section className="panel stack cc22-guardian-scams" style={{ "--gap": "10px" } as CSSProperties} aria-label="Scam checks">
      <h2 className="section-title" style={{ margin: 0 }}><ShieldAlert size={20} aria-hidden="true" /> Maggie asked "Is this a scam?"</h2>
      {open.map((r) => (
        <Link key={r.id} className="list-row" to={`/app/guardian/scams/${r.id}`}>
          <span className="grow"><b>{SCAM_KINDS.find((k) => k.kind === r.kind)?.label}</b><span className="list-sub" style={{ display: "block" }}>{fmtWhen(r.at)} · {r.checked.length} of {SCAM_CHECKLIST.length} done</span></span>
          <span className="badge orange">Open</span>
        </Link>
      ))}
    </section>
  );
}

/** Sarah's view of one report: what Maggie shared, Call Maggie, the checklist and Mark resolved (CC-133). */
export function ScamReportPage() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const { id } = useParams();
  const me = meId(state.persona);
  const r: ScamReport | undefined = (state.scams ?? []).find((x) => x.id === id);
  const [reply, setReply] = useState("");
  const elder = member(state, ELDER);

  if (!can(state, me, "respond", "scams") || !r) {
    return (
      <div className="page narrow stack" style={{ "--gap": "16px" } as CSSProperties}>
        <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
        <h1>Scam check</h1>
        <p className="muted">{r ? "Only Maggie's guardians can open this." : "This report isn't here any more."}</p>
      </div>
    );
  }
  const kind = SCAM_KINDS.find((k) => k.kind === r.kind)?.label;
  return (
    <div className="page narrow stack" style={{ "--gap": "18px" } as CSSProperties}>
      <button className="btn ghost notes-back" onClick={() => nav("/app/guardian")}><ArrowLeft /> Home</button>
      <div className="page-head"><div><p className="page-kicker">Scam check</p><h1>{kind}</h1></div>{r.status === "resolved" ? <span className="badge green">Resolved</span> : <span className="badge orange">Open</span>}</div>

      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-label="What Maggie shared">
        <p className="muted small" style={{ margin: 0 }}>Maggie asked {fmtWhen(r.at)}</p>
        {r.note ? <p className="cc22-note">"{r.note}"</p> : <p className="muted" style={{ margin: 0 }}>She didn't add a note.</p>}
        {r.photoId && <StoredPhoto id={r.photoId} alt="Photo Maggie shared" size={200} />}
        {r.photoRemovedAt && <p className="muted small" style={{ margin: 0 }}>The photo was deleted 30 days after this was resolved.</p>}
        <a href={telOf(elder?.phone)} className="btn lg block"><Phone size={20} /> Call Maggie</a>
      </section>

      <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties} aria-label="Checklist">
        <h2 className="section-title" style={{ margin: 0 }}>Checklist</h2>
        <p className="muted small" style={{ margin: 0 }}>Every guardian sees the same ticks. Circle Care doesn't fill in or send anything for Maggie.</p>
        {SCAM_CHECKLIST.map((c) => (
          <label key={c.id} className="row cc22-check" style={{ "--gap": "10px" } as CSSProperties}>
            <input type="checkbox" checked={r.checked.includes(c.id)} disabled={r.status === "resolved"} onChange={(e) => actions.checkScam(r.id, c.id, e.target.checked)} />
            <span>{c.text}</span>
          </label>
        ))}
      </section>

      {r.status === "open" ? (
        <form className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-label="Mark resolved" onSubmit={(e) => { e.preventDefault(); actions.resolveScam(r.id, reply.trim() || undefined); toast("Maggie will see it's resolved"); }}>
          <label className="stack" style={{ "--gap": "6px" } as CSSProperties}>
            <b>A note for Maggie <span className="muted small">(optional)</span></b>
            <textarea className="input" rows={2} maxLength={SCAM_NOTE_MAX} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="It was a scam. I called the bank and your card is safe." />
          </label>
          <p className="muted small" style={{ margin: 0 }}>Without a note, Maggie sees "{nameOf(state, me)} checked this. You're safe."</p>
          <button className="btn" type="submit">Mark resolved</button>
        </form>
      ) : (
        <section className="panel cc22-scam-safe" aria-label="Resolved">
          <CheckCircle2 size={24} aria-hidden="true" />
          <p className="grow" style={{ margin: 0 }}>Resolved by {nameOf(state, r.resolvedBy)}. Maggie sees: "{scamAnswer(state, r)}"</p>
        </section>
      )}
    </div>
  );
}

/** CC-134: this week's tip on Maggie's home. */
export function ElderTipCard() {
  const { state, actions } = useStore();
  const { speak, supported } = useSpeech();
  const tip = tipCard(state);
  if (!tip) return null;
  return (
    <section className="panel stack cc22-tip" style={{ "--gap": "12px" } as CSSProperties} aria-label="This week's tip">
      <p className="cc22-tip-k"><Lightbulb size={20} aria-hidden="true" /> This week's tip · {tipProgress(state)}</p>
      <h2 className="cc22-tip-title">{tip.title}</h2>
      <p style={{ margin: 0 }}>{tip.text}</p>
      <p className="cc22-tip-example"><b>For example:</b> {tip.example}</p>
      <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
        <button className="btn lg" onClick={() => actions.tipGotIt()}>Got it</button>
        <button className="btn secondary lg" onClick={() => actions.tipNotNow()}>Not now</button>
        {supported && state.settings.readAloud && <button className="btn secondary lg" onClick={() => speak(`${tip.title}. ${tip.text} For example: ${tip.example}`)}><Volume2 size={22} /> Read it to me</button>}
      </div>
    </section>
  );
}

