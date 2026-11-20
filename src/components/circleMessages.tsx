import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BellOff, Clock, Pause, Pencil, Pin, PinOff, Play, Search, SkipForward, Undo2, Volume2, X } from "lucide-react";
import type { ChatMessage, State } from "../data/types";
import { useStore } from "../data/store";
import { CHAT_MAX, phiHint } from "../data/everyday";
import {
  PIN_MAX, canChange, canPin, changeLeft, chatMutedUntil, demoTag, messageText, pinnedNotes, pinsFull, readAloudLines,
  scheduledBy, searchChat, seenLine, type ReadLine,
} from "../data/circleMessages";
import { clock, nameOf } from "../data/selectors";
import { Sheet, useToast } from "./ui";
import { HealthHint } from "./chat";
import { addDays, fmtShortDay, fmtTime, hm, ymd } from "../lib/time";

// Sprint 27 "Circle Messages" (CC-249 – CC-256): pinned notes with "Seen by", edit or take back within
// 5 minutes, send later, mute for a day, read new messages aloud to Maggie and search.

const when = (iso: string, now: Date) => {
  const day = ymd(new Date(iso));
  const label = day === ymd(now) ? "today" : day === ymd(addDays(now, 1)) ? "tomorrow" : fmtShortDay(day);
  return `${label} at ${fmtTime(iso)}`;
};

/** The value a datetime-local input wants, in the device's time. */
const localInput = (d: Date) => `${ymd(d)}T${hm(d)}`;

/* ---------------- CC-249, CC-250: pinned notes ---------------- */

export function PinnedNotes({ large, me, onSpeak }: { large: boolean; me: string; onSpeak?: (text: string) => void }) {
  const { state, actions } = useStore();
  const pins = pinnedNotes(state, me);
  if (!pins.length) return null;
  return (
    <section className="pinned glass" aria-label="Pinned notes">
      <h2 className="pinned-title"><Pin size={large ? 22 : 16} /> Pinned</h2>
      {pins.map((m) => (
        <div key={m.id} className="pinned-note" data-testid="pinned-note">
          <p className="pinned-text">{m.text}</p>
          <p className="pinned-meta">
            {m.by === me ? "You" : nameOf(state, m.by)}, {fmtShortDay(m.at)}
            {m.pinnedBy && <> · pinned by {m.pinnedBy === me ? "you" : nameOf(state, m.pinnedBy)}</>}
          </p>
          <p className="pinned-seen">{seenLine(state, m)}</p>
          <div className="pinned-actions">
            {large && onSpeak && <button type="button" className="btn secondary" onClick={() => onSpeak(`Pinned note from ${m.by === me ? "you" : nameOf(state, m.by)}: ${m.text}`)}><Volume2 size={22} /> Read aloud</button>}
            {canPin(me) && <button type="button" className={`btn plain ${large ? "" : "sm"}`} onClick={() => actions.unpinChat(m.id)}><PinOff size={large ? 22 : 16} /> Unpin</button>}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------------- CC-249, CC-251: what you can do with one message ---------------- */

type Step =
  | { kind: "menu" }
  | { kind: "edit"; text: string }
  | { kind: "edit-hint"; text: string; spotted: string[] }
  | { kind: "pin-hint"; spotted: string[] }
  | { kind: "pin-full" }
  | { kind: "take-back" };

export function MessageOptions({ m, me, large, onClose }: { m: ChatMessage; me: string; large: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const changeable = canChange(state, me, m);
  const pinnable = canPin(me) && !m.pinnedAt && !m.removedAt;

  const pin = (replaceId?: string) => { actions.pinChat(m.id, replaceId); toast("Pinned for everyone in the chat"); onClose(); };
  const tryPin = () => {
    const spotted = phiHint(state, m.text);
    if (spotted.length) return setStep({ kind: "pin-hint", spotted });
    if (pinsFull(state)) return setStep({ kind: "pin-full" });
    pin();
  };
  const save = (text: string) => { actions.editChat(m.id, text); toast("Message edited"); onClose(); };
  const trySave = (text: string) => {
    const t = text.trim();
    if (!t || t.length > CHAT_MAX) return;
    if (t === m.text) return onClose();
    const spotted = phiHint(state, t);
    if (spotted.length) return setStep({ kind: "edit-hint", text: t, spotted });
    save(t);
  };

  if (step.kind === "edit-hint") {
    return <HealthHint text={step.text} spotted={step.spotted} canNote={false} sendLabel="Save anyway" noNoteText="Edit the message, or save it anyway." onEdit={() => setStep({ kind: "edit", text: step.text })} onSend={() => save(step.text)} onNote={() => undefined} />;
  }
  if (step.kind === "pin-hint") {
    return (
      <HealthHint
        text={m.text} spotted={step.spotted} canNote={false} sendLabel="Pin anyway"
        intro="A pinned note stays at the top of the chat for everyone in it. Health details are safer in Notes, where Maggie's sharing choices decide who sees them."
        noNoteText="You can leave it unpinned, or pin it anyway."
        onEdit={onClose}
        onSend={() => (pinsFull(state) ? setStep({ kind: "pin-full" }) : pin())}
        onNote={() => undefined}
      />
    );
  }

  return (
    <Sheet title={step.kind === "pin-full" ? `${PIN_MAX} notes are pinned` : step.kind === "edit" ? "Edit message" : step.kind === "take-back" ? "Take back this message?" : "Message"} onClose={onClose}>
      <div className={`stack ${large ? "big-targets" : ""}`} style={{ "--gap": "12px" } as CSSProperties}>
        {step.kind === "menu" && (
          <>
            <blockquote className="hint-quote">{m.text}</blockquote>
            {changeable && <p className="tiny">You can edit or take it back for {changeLeft(state, m)} more minute{changeLeft(state, m) === 1 ? "" : "s"}.</p>}
            {changeable && <button type="button" className="btn secondary lg" onClick={() => setStep({ kind: "edit", text: m.text })}><Pencil size={20} /> Edit</button>}
            {changeable && <button type="button" className="btn secondary lg" onClick={() => setStep({ kind: "take-back" })}><Undo2 size={20} /> Take back</button>}
            {pinnable && <button type="button" className="btn secondary lg" onClick={tryPin}><Pin size={20} /> Pin for everyone</button>}
            {canPin(me) && m.pinnedAt && <button type="button" className="btn secondary lg" onClick={() => { actions.unpinChat(m.id); onClose(); }}><PinOff size={20} /> Unpin</button>}
          </>
        )}
        {step.kind === "edit" && <EditBox initial={step.text} onSave={trySave} onCancel={onClose} />}
        {step.kind === "take-back" && (
          <>
            <p>Everyone will see "Message removed by {nameOf(state, me)}". The words aren't kept anywhere, so this can't be undone.</p>
            <button type="button" className="btn danger lg" onClick={() => { actions.takeBackChat(m.id); toast("Message taken back"); onClose(); }}><Undo2 size={20} /> Take back</button>
            <button type="button" className="btn plain" onClick={onClose}>Keep it</button>
          </>
        )}
        {step.kind === "pin-full" && (
          <>
            <p>Unpin one to make room for this note.</p>
            <div className="list">
              {pinnedNotes(state, me).map((p) => (
                <div key={p.id} className="list-row">
                  <span className="grow"><b>{p.text}</b><span className="list-sub" style={{ display: "block" }}>{nameOf(state, p.by)}, {fmtShortDay(p.at)}</span></span>
                  <button type="button" className="btn secondary sm" onClick={() => pin(p.id)} aria-label={`Unpin "${p.text}" and pin this one`}>Unpin</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn plain" onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function EditBox({ initial, onSave, onCancel, label = "Save" }: { initial: string; onSave: (t: string) => void; onCancel: () => void; label?: string }) {
  const [text, setText] = useState(initial);
  const over = text.trim().length > CHAT_MAX;
  return (
    <>
      <label className="sr-only" htmlFor="edit-msg">Message</label>
      <textarea id="edit-msg" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      {over && <p className="small" role="alert" style={{ color: "var(--red)" }}>Messages can be up to {CHAT_MAX} characters.</p>}
      <button type="button" className="btn lg" disabled={!text.trim() || over} onClick={() => onSave(text)}>{label}</button>
      <button type="button" className="btn plain" onClick={onCancel}>Cancel</button>
    </>
  );
}

/* ---------------- CC-252: send later ---------------- */

/** Picks the words and the time. The health-detail check runs before anything is scheduled. */
export function ScheduleSheet({ initial, edit, onClose, onScheduled }: { initial: string; edit?: { id: string; sendAt: string }; onClose: () => void; onScheduled?: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const now = clock(state);
  const morning = new Date(`${ymd(addDays(now, 1))}T08:00:00`);
  const [text, setText] = useState(initial);
  const [at, setAt] = useState(edit ? localInput(new Date(edit.sendAt)) : localInput(morning));
  const [hint, setHint] = useState<string[] | null>(null);
  const t = text.trim();
  const sendAt = at ? new Date(at) : null;
  const past = !sendAt || Number.isNaN(sendAt.getTime()) || sendAt <= now;
  const over = t.length > CHAT_MAX;

  const save = () => {
    const iso = sendAt!.toISOString();
    if (edit) actions.changeScheduledChat(edit.id, t, iso); else actions.scheduleChat(t, iso);
    toast(`Scheduled for ${when(iso, now)}`);
    onScheduled?.();
    onClose();
  };
  if (hint) return <HealthHint text={t} spotted={hint} canNote={false} sendLabel="Schedule anyway" noNoteText="Edit the message, or schedule it anyway." onEdit={() => setHint(null)} onSend={save} onNote={() => undefined} />;
  return (
    <Sheet title={edit ? "Change scheduled message" : "Send later"} onClose={onClose}>
      <div className="stack" style={{ "--gap": "12px" } as CSSProperties}>
        <label className="field"><span className="k">Message</span>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message to send later" autoFocus />
        </label>
        <label className="field"><span className="k">Send at</span>
          <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Send at" />
        </label>
        {past && <p className="small" role="alert" style={{ color: "var(--red)" }}>Pick a time later than now.</p>}
        {over && <p className="small" role="alert" style={{ color: "var(--red)" }}>Messages can be up to {CHAT_MAX} characters.</p>}
        <button type="button" className="btn lg" disabled={!t || past || over} onClick={() => { const spotted = phiHint(state, t); if (spotted.length) setHint(spotted); else save(); }}><Clock size={18} /> {edit ? "Save" : "Schedule"}</button>
        <p className="tiny">Only you can see it until it's sent. In this demo it goes out while Circle Care is open on this device.</p>
      </div>
    </Sheet>
  );
}

/** Your own scheduled messages, above the composer. Nobody else sees them. */
export function ScheduledList({ me }: { me: string }) {
  const { state, actions } = useStore();
  const [editing, setEditing] = useState<{ id: string; text: string; sendAt: string } | null>(null);
  const list = scheduledBy(state, me);
  if (!list.length) return null;
  const now = clock(state);
  return (
    <section className="scheduled" aria-label="Your scheduled messages">
      {list.map((x) => (
        <div key={x.id} className="scheduled-row glass">
          <p className="scheduled-when"><Clock size={14} /> Scheduled for {when(x.sendAt, now)}</p>
          <p className="scheduled-text">{x.text}</p>
          <div className="scheduled-actions">
            <button type="button" className="btn plain sm" onClick={() => actions.sendScheduledNow(x.id)}>Send now</button>
            <button type="button" className="btn plain sm" onClick={() => setEditing(x)}>Change</button>
            <button type="button" className="btn plain sm" onClick={() => actions.cancelScheduledChat(x.id)}>Cancel</button>
          </div>
        </div>
      ))}
      {editing && <ScheduleSheet initial={editing.text} edit={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/* ---------------- CC-253: mute for a day ---------------- */

export function MuteSheet({ onClose }: { onClose: () => void }) {
  const { actions } = useStore();
  const toast = useToast();
  const pick = (how: "morning" | "day") => { actions.muteChat(how); toast("Chat muted"); onClose(); };
  return (
    <Sheet title="Mute the family chat" onClose={onClose}>
      <div className="stack big-targets" style={{ "--gap": "12px" } as CSSProperties}>
        <p>New messages still arrive, but you won't get a notice for them. Safety alerts, like a missed check-in or an SOS, always reach you.</p>
        <button type="button" className="btn secondary lg" onClick={() => pick("morning")}>Until tomorrow morning</button>
        <button type="button" className="btn secondary lg" onClick={() => pick("day")}>For 24 hours</button>
        <button type="button" className="btn plain" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

export function MutedBanner({ me }: { me: string }) {
  const { state, actions } = useStore();
  const until = chatMutedUntil(state, me);
  if (!until) return null;
  return (
    <div className="muted-banner" role="status">
      <BellOff size={18} />
      <span className="grow">Chat muted until {when(until, clock(state))}</span>
      <button type="button" className="btn plain sm" onClick={() => actions.unmuteChat()}>Unmute</button>
    </div>
  );
}

/* ---------------- CC-255: search ---------------- */

export function ChatSearch({ me, onPick, onClose }: { me: string; onPick: (id: string) => void; onClose: () => void }) {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const results = searchChat(state, me, q);
  return (
    <section className="chat-search glass" aria-label="Search the chat">
      <div className="chat-search-bar">
        <Search size={18} aria-hidden />
        <label className="sr-only" htmlFor="chat-search">Search messages</label>
        <input id="chat-search" className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" autoFocus autoComplete="off" />
        <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}><X size={18} /></button>
      </div>
      {q.trim().length >= 2 && (
        results.length
          ? <ul className="chat-results" aria-live="polite">
              {results.slice(0, 20).map((m) => (
                <li key={m.id}><button type="button" className="chat-result" onClick={() => onPick(m.id)}>
                  <b>{m.by === me ? "You" : nameOf(state, m.by)}</b> · {fmtShortDay(m.at)}<span>{m.text}</span>
                </button></li>
              ))}
            </ul>
          : <p className="small muted" aria-live="polite">No messages with "{q.trim()}".</p>
      )}
    </section>
  );
}

/* ---------------- CC-254: read new messages aloud to Maggie ---------------- */

/** The lines to read are taken when the chat opens, before it's marked read. Pause and Next are big buttons. */
export function useReadAloudLines(state: State, me: string, on: boolean) {
  const [lines] = useState<ReadLine[]>(() => (on ? readAloudLines(state, me) : []));
  return lines;
}

export function ReadAloudPanel({ lines }: { lines: ReadLine[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const iRef = useRef(i);
  iRef.current = i;

  const say = (n: number) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    if (n >= lines.length) { setPlaying(false); setDone(true); return; }
    setI(n); setPlaying(true); setDone(false);
    const u = new SpeechSynthesisUtterance(lines[n].text);
    u.rate = 0.92;
    u.onend = () => { if (iRef.current === n) say(n + 1); };
    window.speechSynthesis.speak(u);
  };
  const pause = () => { if (supported) window.speechSynthesis.cancel(); setPlaying(false); };
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  if (!lines.length) return null;
  const n = lines.filter((l) => !l.id.startsWith("pin-")).length;
  return (
    <section className="read-aloud glass" aria-label="Read messages aloud">
      <p className="read-aloud-title"><Volume2 size={26} /> {n ? `${n} new message${n > 1 ? "s" : ""}` : "A new pinned note"}</p>
      <p className="read-aloud-now" aria-live="polite">{done ? "That's everything new." : playing ? lines[i].text : "Tap Read to me to hear them."}</p>
      {supported ? (
        <div className="read-aloud-actions big-targets">
          {playing
            ? <button type="button" className="btn lg" onClick={pause}><Pause size={26} /> Pause</button>
            : <button type="button" className="btn lg" onClick={() => say(done ? 0 : i)}><Play size={26} /> {done ? "Read again" : i ? "Keep reading" : "Read to me"}</button>}
          <button type="button" className="btn secondary lg" disabled={done || i >= lines.length - 1} onClick={() => say(i + 1)}><SkipForward size={26} /> Next</button>
        </div>
      ) : <p className="small muted">This device can't read aloud.</p>}
    </section>
  );
}

/* ---------------- One message's words and labels ---------------- */

export function MessageBody({ state, m }: { state: State; m: ChatMessage }) {
  if (m.removedAt) return <p className="removed">{messageText(state, m)}</p>;
  return <p>{m.text}</p>;
}

export function messageTags(m: ChatMessage) {
  const tags: string[] = [];
  if (m.editedAt && !m.removedAt) tags.push("edited");
  if (m.pinnedAt) tags.push("pinned");
  const d = demoTag(m);
  if (d) tags.push(d);
  return tags;
}
