import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Lock, Mic, Send, StickyNote, Users, RotateCcw, MessageCircleHeart } from "lucide-react";
import type { ChatMessage, State } from "../data/types";
import { useStore, useCan } from "../data/store";
import { CHAT_MAX, chatMembers, chatMessages, inChat, lastChatMessage, phiHint, unreadChat } from "../data/everyday";
import { clock, member, meId, nameOf } from "../data/selectors";
import { Avatar, Sheet, Toggle, useToast } from "./ui";
import { fmtTime, fmtShortDay, ymd } from "../lib/time";
import "./chat.css";

// CC-164 – CC-165: the circle's private family chat, as designed in Figma
// ("Circle Care · Sprint 12 · Family chat"). Sarah's and Ana's view is a regular chat;
// Maggie's (`large`) has 22pt bubbles, one big microphone and a "You said" check before sending.

/** "Maggie, Sarah and James" */
const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/* ---------------- Speech to text (on the device) ---------------- */

type RecError = { error?: string };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: RecError) => void) | null; onend: (() => void) | null;
};
function recognitionClass(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
function newRecognition(): Recognition | null {
  const C = recognitionClass();
  return C ? new C() : null;
}
/** Errors that mean voice can't work here at all; anything else (silence, a restart) just stops listening. */
const BLOCKED = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"];

/**
 * CC-165: Maggie talks, the words appear in a "You said" card, and nothing is sent until she taps Send.
 * Where the device has no speech recognition, or she chooses to, she types instead. Only words that
 * came from speech, unedited, are marked "By voice".
 */
function VoiceReply({ initial = "", typing = false, onSend, onClose }: { initial?: string; typing?: boolean; onSend: (text: string, spoken: boolean) => void; onClose: () => void }) {
  const [supported] = useState(() => !!recognitionClass());
  const [text, setText] = useState(initial);
  const [mode, setMode] = useState<"voice" | "type">(typing || !supported ? "type" : "voice");
  const [spoken, setSpoken] = useState(false);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState(typing || supported ? "" : "Voice isn't available on this device, so you can type your message.");
  const rec = useRef<Recognition | null>(null);

  const stop = () => {
    const r = rec.current;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    try { r.abort(); } catch { /* already stopped */ }
    rec.current = null;
    setListening(false);
  };
  const start = () => {
    stop();
    const r = newRecognition();
    if (!r) { setMode("type"); return; }
    rec.current = r;
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => { setText(Array.from(e.results).map((x) => x[0].transcript).join(" ")); setSpoken(true); };
    r.onerror = (e) => {
      setListening(false);
      if (e.error && BLOCKED.includes(e.error)) { setMode("type"); setNote("Voice isn't available right now, so you can type your message."); }
      else if (e.error === "no-speech") setNote("I didn't hear anything. Tap to talk again.");
    };
    r.onend = () => { setListening(false); if (rec.current === r) rec.current = null; };
    setText(""); setSpoken(false); setNote("");
    setListening(true);
    try { r.start(); } catch { setListening(false); setMode("type"); }
  };
  const typeInstead = () => { stop(); setSpoken(false); setMode("type"); };
  useEffect(() => { if (mode === "voice") start(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = text.trim();
  const tooLong = t.length > CHAT_MAX;
  return (
    <Sheet title="Talk to your family" onClose={onClose}>
      <div className="voice big-targets stack" style={{ "--gap": "18px" } as CSSProperties}>
        {(t || mode === "type") && (
          <div className="you-said glass">
            <span className="k">{mode === "type" ? "Your message" : "You said"}</span>
            {mode === "type"
              ? <textarea className="input" rows={3} value={text} onChange={(e) => { setText(e.target.value); setSpoken(false); }} aria-label="Your message" autoFocus />
              : <p>{text}</p>}
            {tooLong && <p className="small" style={{ color: "var(--red)" }}>That's longer than a chat message can be ({t.length} of {CHAT_MAX}). Please shorten it.</p>}
            <div className="you-said-actions">
              <button type="button" className="btn lg" disabled={!t || tooLong} onClick={() => { stop(); onSend(t, spoken && mode === "voice"); }}><Send size={24} /> Send</button>
              {mode === "voice"
                ? <button type="button" className="btn secondary lg" onClick={start}><RotateCcw size={24} /> Try again</button>
                : supported && <button type="button" className="btn secondary lg" onClick={() => { setMode("voice"); start(); }}><Mic size={24} /> Talk instead</button>}
            </div>
          </div>
        )}
        {mode === "voice" && (
          <>
            <button type="button" className={`mic-big ${listening ? "on" : ""}`} onClick={() => (listening ? rec.current?.stop() : start())} aria-label={listening ? "Stop listening" : "Tap to talk"}>
              <Mic size={44} />
            </button>
            <p className="center muted" aria-live="polite">{listening ? "Listening. Speak now." : note || "Tap to talk"}</p>
            <button type="button" className="btn plain" onClick={typeInstead}>Type instead</button>
          </>
        )}
        {mode === "type" && note && <p className="center muted small">{note}</p>}
        <p className="tiny center">{mode === "voice" ? "Your words are turned into text on this device. " : ""}Nothing is sent until you tap Send.</p>
      </div>
    </Sheet>
  );
}

/* ---------------- The health-detail check (CC-164) ---------------- */

function HealthHint({ text, spotted, canNote, onNote, onSend, onEdit }: { text: string; spotted: string[]; canNote: boolean; onNote: () => void; onSend: () => void; onEdit: () => void }) {
  return (
    <Sheet title="This looks like a health detail" onClose={onEdit}>
      <div className="hint big-targets stack" style={{ "--gap": "14px" } as CSSProperties}>
        <div className="hint-icon"><StickyNote size={26} /></div>
        <p>Notes keep health details on Maggie's record, where her sharing choices decide who sees them.</p>
        <blockquote className="hint-quote">{text}</blockquote>
        <div>
          <span className="k">Spotted</span>
          <div className="chips">{spotted.map((w) => <span key={w} className="chip">{w}</span>)}</div>
        </div>
        <div className="stack" style={{ "--gap": "10px" } as CSSProperties}>
          {canNote
            ? <button type="button" className="btn lg" onClick={onNote}><StickyNote size={20} /> Save as a note</button>
            : <p className="small muted">You can add notes only while you're on shift, so edit the message or send it anyway.</p>}
          <button type="button" className="btn secondary lg" onClick={onSend}>Send anyway</button>
          <button type="button" className="btn plain" onClick={onEdit}>Edit</button>
        </div>
        {canNote && <p className="tiny">A note can be read by Maggie, Sarah, James and caregivers while they're on shift.</p>}
        <p className="tiny center">Only you see this check. Nothing is sent until you choose.</p>
      </div>
    </Sheet>
  );
}

/* ---------------- The chat ---------------- */

/** Names of the other people who have read up to this message. */
function readBy(state: State, m: ChatMessage) {
  return chatMembers(state)
    .filter((p) => p.id !== m.by && (state.chat.joinedAt[p.id] ?? "") <= m.at && (state.chat.readAt[p.id] ?? "") >= m.at)
    .map((p) => p.short);
}

export function ChatView({ large = false }: { large?: boolean }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const [draft, setDraft] = useState("");
  /** `sheet`: the words came from the talk-or-type sheet, so Edit reopens it instead of the composer. */
  const [hint, setHint] = useState<{ text: string; spotted: string[]; via?: "voice"; sheet: boolean } | null>(null);
  const [voice, setVoice] = useState<{ initial?: string; typing?: boolean } | null>(null);
  const [people, setPeople] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const msgs = chatMessages(state, me);
  const isIn = inChat(state, me);
  const unread = unreadChat(state, me);
  const canNote = useCan("write", "notes");
  const opened = useRef(false);

  // Opening the chat marks it read; someone who isn't in it is refused and the refusal is audited.
  // Opening the chat once marks it read, or records a refused attempt by someone who isn't in it.
  // Being switched off while it's open is not a new attempt, so it isn't logged again.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    actions.readChat();
    if (isIn) actions.logView("the family chat");
  }, [isIn, actions]);
  useEffect(() => { if (isIn && unread > 0) actions.readChat(); }, [isIn, unread, actions]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [msgs.length]);

  if (!isIn) {
    return (
      <div className="page narrow center" style={{ paddingTop: 56 }}>
        <Users size={44} color="var(--muted)" style={{ margin: "0 auto" }} />
        <h1 className="t-lg" style={{ marginTop: 12 }}>The family chat is for Maggie's family</h1>
        <p className="lede">Paid caregivers join when Maggie or Sarah adds them. Your hand-offs and notes work as usual.</p>
      </div>
    );
  }

  const send = (text: string, via?: "voice") => {
    actions.sendChat(text, via);
    setDraft(""); setHint(null); setVoice(null);
  };
  /** Every message passes the health-detail check first, typed or spoken. */
  const trySend = (text: string, via?: "voice", sheet = false) => {
    const t = text.trim();
    if (!t || t.length > CHAT_MAX) return;
    const spotted = phiHint(state, t);
    if (spotted.length) { setVoice(null); setHint({ text: t, spotted, via, sheet }); return; }
    send(t, via);
    if (sheet) toast("Sent to your family");
  };

  const names = chatMembers(state).map((m) => (m.id === me && large ? "you" : m.short));
  const lastMine = [...msgs].reverse().find((m) => m.by === me);
  const today = ymd(clock(state));
  let lastDay = "";
  const over = draft.trim().length > CHAT_MAX;

  return (
    <div className={`page chat ${large ? "chat-large" : ""}`}>
      <header className="chat-head">
        {large && <Link to="/app/elder" className="chat-back"><ChevronLeft size={28} /> Home</Link>}
        <div className="chat-title">
          <h1>Family</h1>
          {!large && <button type="button" className="btn plain sm" onClick={() => setPeople(true)}><Users size={16} /> People</button>}
        </div>
        <p className="chat-lock"><Lock size={large ? 18 : 14} /> Only {listNames(names)} can read this</p>
        {large && <button type="button" className="btn plain people-btn" onClick={() => setPeople(true)}><Users size={22} /> People</button>}
      </header>

      <div className="chat-list" role="log" aria-live="polite" aria-label="Messages">
        {msgs.length === 0 && <p className="chat-day">Say hello to your family</p>}
        {msgs.map((m) => {
          const mine = m.by === me;
          const day = ymd(new Date(m.at));
          const showDay = day !== lastDay;
          lastDay = day;
          const reads = m === lastMine ? readBy(state, m) : [];
          const who = member(state, m.by);
          const elderMsg = m.by === state.elderId && !mine;
          return (
            <div key={m.id}>
              {showDay && <p className="chat-day">{day === today ? "Today" : fmtShortDay(day)}</p>}
              <div className={`bubble-row ${mine ? "mine" : ""}`}>
                {!mine && <Avatar m={who} size={large ? 48 : 32} />}
                <div className={`bubble ${mine ? "mine" : "glass"} ${elderMsg ? "elder" : ""}`}>
                  {!mine && <b className="who">{nameOf(state, m.by)}</b>}
                  <p>{m.text}</p>
                  <span className="when">
                    {fmtTime(m.at)}
                    {m.via === "voice" && <> · <Mic size={12} aria-hidden /> By voice</>}
                    {reads.length > 0 && <> · Read by {listNames(reads)}</>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {large ? (
        <div className="elder-compose">
          <button type="button" className="mic-big" onClick={() => setVoice({})} aria-label="Tap to talk"><Mic size={44} /></button>
          <p className="center muted">Tap to talk, or <button type="button" className="linklike" onClick={() => setVoice({ typing: true })}>type instead</button></p>
        </div>
      ) : (
        <form className="composer glass" onSubmit={(e) => { e.preventDefault(); trySend(draft); }}>
          <button type="button" className="icon-btn" aria-label="Talk instead of typing" onClick={() => setVoice({})}><Mic size={20} /></button>
          <label className="sr-only" htmlFor="chat-input">Message</label>
          <input id="chat-input" className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the family" autoComplete="off" aria-invalid={over || undefined} />
          <button className="btn send" disabled={!draft.trim() || over} aria-label="Send"><Send size={18} /></button>
        </form>
      )}
      {over && <p className="small" role="alert" style={{ color: "var(--red)", marginTop: -8 }}>Messages can be up to {CHAT_MAX} characters. This one is {draft.trim().length}.</p>}

      {voice && <VoiceReply initial={voice.initial} typing={voice.typing} onClose={() => setVoice(null)} onSend={(t, spoken) => trySend(t, spoken ? "voice" : undefined, true)} />}
      {hint && (
        <HealthHint
          text={hint.text}
          spotted={hint.spotted}
          canNote={canNote}
          onEdit={() => { if (hint.sheet || large) setVoice({ initial: hint.text, typing: true }); else setDraft(hint.text); setHint(null); }}
          onSend={() => { send(hint.text, hint.via); if (hint.sheet) toast("Sent to your family"); }}
          onNote={() => { actions.addNote(hint.text, "everyone"); setDraft(""); setHint(null); toast("Saved to Notes, not the chat"); }}
        />
      )}
      {people && <ChatPeople state={state} large={large} onClose={() => setPeople(false)} />}
    </div>
  );
}

/** Who is in the chat. Maggie and Sarah can switch a paid caregiver on or off (CC-165). */
function ChatPeople({ state, large, onClose }: { state: State; large: boolean; onClose: () => void }) {
  const { actions } = useStore();
  const me = meId(state.persona);
  const canAdd = state.persona === "guardian" || state.persona === "elder";
  const pros = state.members.filter((m) => m.role === "pro" && m.status === "active");
  return (
    <Sheet title="In the family chat" onClose={onClose}>
      <div className="stack" style={large ? { fontSize: "var(--text-base)" } : undefined}>
        <div className="list">
          {chatMembers(state).map((m) => (
            <div key={m.id} className="list-row"><Avatar m={m} size={36} /><span className="grow"><b>{m.short}{m.id === me ? " (you)" : ""}</b><span className="list-sub" style={{ display: "block" }}>{m.relation}</span></span></div>
          ))}
        </div>
        {canAdd && pros.length > 0 && (
          <>
            <h3 className="section-title" style={{ fontSize: 17 }}>Paid caregivers</h3>
            <p className="tiny" style={{ marginTop: -8 }}>They aren't in the family chat unless you add them. Switching someone off ends their access right away.</p>
            <div className="list">
              {pros.map((m) => (
                <label key={m.id} className="list-row"><Avatar m={m} size={36} /><span className="grow"><b>{m.short}</b><span className="list-sub" style={{ display: "block" }}>{m.relation}</span></span>
                  <Toggle checked={state.chat.pros.includes(m.id)} onChange={(v) => actions.setChatPro(m.id, v)} label={`${m.short} in the family chat`} /></label>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** CC-165: the chat tile on Maggie's home. Hidden when she turns it off; the chat stays under Family. */
export function ElderChatTile() {
  const { state } = useStore();
  const elder = state.elderId;
  if (!state.settings.elderChatOnHome || !inChat(state, elder)) return null;
  const unread = unreadChat(state, elder);
  const last = lastChatMessage(state, elder);
  const who = last ? member(state, last.by) : undefined;
  const status = unread ? `${unread} new message${unread > 1 ? "s" : ""}` : "No new messages";
  return (
    <section className="elder-tile chat-tile" aria-label={`Family chat. ${status}`}>
      <div className="chat-tile-top">
        <MessageCircleHeart size={40} color="var(--guard)" style={{ flex: "none" }} />
        <span className="grow"><span className="v" style={{ display: "block" }}>Family chat</span><span className={`s ${unread ? "new" : ""}`} style={{ display: "block" }}>{status}</span></span>
      </div>
      {last && who && (
        <p className="chat-tile-preview"><b>{last.by === elder ? "You" : who.short}:</b> {last.text}</p>
      )}
      <Link to="/app/elder/chat" className="btn lg">Open chat</Link>
    </section>
  );
}
