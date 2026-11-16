import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Lock, Mic, Pencil, UserCog, Users } from "lucide-react";
import { useStore } from "../data/store";
import { meId, member, nameOf } from "../data/selectors";
import { aboutView, aboutCandidates, changesForMaggie, sectionTitle, shiftSections, ABOUT_MAX } from "../data/aboutMe";
import { adminCandidates, adminPeople } from "../data/callLog";
import { ELDER, GUARDIAN } from "../data/demo";
import type { AboutKey, AboutSection } from "../data/types";
import { Avatar, Toggle, useToast } from "./ui";
import { fmtShortDay, fmtTime } from "../lib/time";
import "./sprint19.css";

/**
 * CC-219: Maggie's What matters to me page. Four sections in her own words. Each is private until she picks who
 * sees it. Sarah can help write it unless Maggie turns that off, and Maggie sees what Sarah changed.
 */
export function AboutMePage() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const me = meId(state.persona);
  const isElder = me === ELDER;
  const view = aboutView(state, me);
  const [editing, setEditing] = useState<AboutKey | null>(null);
  const [draft, setDraft] = useState("");
  // Criterion 5: what Sarah changed, captured as the page opens, then marked seen.
  const changes = useRef<AboutSection[] | null>(null);
  if (changes.current === null) changes.current = isElder ? changesForMaggie(state).map((x) => ({ ...x })) : [];

  useEffect(() => {
    actions.logView("What matters to me");
    if (isElder) actions.seenAboutMe();
  }, [actions, isElder]);

  const start = (key: AboutKey, text: string) => { setEditing(key); setDraft(text); };
  const save = (key: AboutKey) => {
    const had = view.find((x) => x.key === key)?.section;
    actions.saveAboutSection(key, draft);
    setEditing(null);
    toast(!draft.trim() ? "Section removed" : had ? "Saved" : isElder ? "Saved. Only you see it until you choose who can" : "Saved. Only you and Maggie see it until she chooses who else can");
  };

  return (
    <div className={`page narrow stack about-me ${isElder ? "elder-about" : ""}`} style={{ "--gap": "18px" } as CSSProperties}>
      <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
      <div className="page-head"><div><p className="page-kicker">{isElder ? "About me" : "About Maggie"}</p><h1>What matters to {isElder ? "me" : "Maggie"}</h1></div></div>
      <p className="muted small">{isElder ? "Write how you like things done, so new caregivers treat you the way you want. You choose who sees each part." : "In Maggie's words. You see the parts she shares with you."}</p>

      {isElder && changes.current.length > 0 && (
        <section className="panel stack about-changes" style={{ "--gap": "10px" } as CSSProperties} aria-label="Changes since you last looked">
          <b>Changes since you last looked</b>
          {changes.current.map((c) => (
            <div key={c.key} className="stack" style={{ "--gap": "4px" } as CSSProperties}>
              <span className="small"><b>{nameOf(state, c.changedBy)}</b> changed <b>{sectionTitle(c.key)}</b>, {fmtShortDay(c.changedAt!)} at {fmtTime(new Date(c.changedAt!))}</span>
              {c.before && <p className="about-before small"><span className="muted">Before:</span> {c.before}</p>}
              <p className="small"><span className="muted">Now:</span> {c.text}</p>
            </div>
          ))}
        </section>
      )}

      {view.length === 0 && (
        <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties}>
          <Lock size={24} color="var(--muted)" />
          <b>Nothing shared with you yet</b>
          <p className="muted small">Maggie chooses who sees each part of this page.</p>
        </section>
      )}

      {view.map((v) => (
        <section key={v.key} className="panel stack about-sec" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby={`about-${v.key}`}>
          <div className="row">
            <h2 id={`about-${v.key}`} className="notes-h grow" style={{ margin: 0 }}>{v.title}</h2>
            {v.canEdit && editing !== v.key && <button className="btn secondary sm" onClick={() => start(v.key, v.section?.text ?? "")} aria-label={`${v.section ? "Change" : "Write"} ${v.title}`}><Pencil size={16} /> {v.section ? "Change" : "Write"}</button>}
          </div>
          {editing === v.key ? (
            <form className="stack" style={{ "--gap": "10px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); save(v.key); }}>
              <label className="field"><span className="muted small">{v.hint}</span>
                <textarea className="input about-text" rows={4} maxLength={ABOUT_MAX} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={v.placeholder} aria-label={v.title} autoFocus />
              </label>
              <p className="tiny"><Mic size={12} aria-hidden="true" /> To speak instead of typing, tap the microphone on your keyboard. Only the words are kept.</p>
              <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
                <button className="btn">Save</button>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          ) : v.section ? (
            <>
              <p className="about-text-read">{v.section.text}</p>
              <SharedLine sec={v.section} />
            </>
          ) : (
            <p className="muted small">{v.hint}. Not written yet.</p>
          )}
          {isElder && v.section && editing !== v.key && <SectionSharing sec={v.section} />}
        </section>
      ))}

      {isElder && (
        <section className="panel row" style={{ "--gap": "12px" } as CSSProperties}>
          <UserCog size={26} color="var(--blue)" style={{ flex: "none" }} aria-hidden="true" />
          <div className="grow"><b>Sarah can help write this</b><p className="muted small">{state.aboutMe.sarahCanEdit ? "She can add parts and change the parts you share with her. You'll see what she changed." : "She can read the parts you share with her, but not change them."}</p></div>
          <Toggle checked={state.aboutMe.sarahCanEdit} onChange={(v) => { actions.setSarahEditing(v); toast(v ? "Sarah can help write it" : "Sarah can only read it"); }} label="Sarah can help write this" />
        </section>
      )}
      {me === GUARDIAN && !state.aboutMe.sarahCanEdit && <p className="tiny">Maggie has turned off editing, so you can read the parts she shares with you but not change them.</p>}
    </div>
  );
}

/** Who sees a section, in a short line. */
function SharedLine({ sec }: { sec: AboutSection }) {
  const { state } = useStore();
  const me = meId(state.persona);
  const names = sec.sharedWith.map((id) => (id === me ? "you" : member(state, id)?.short ?? nameOf(state, id)));
  return <p className="tiny"><Users size={12} aria-hidden="true" /> {names.length ? `Shared with ${names.join(", ")}` : "Only Maggie sees this"}</p>;
}

/** Criterion 4: Maggie picks who sees one section. Used on the page and in her Privacy Center. */
export function SectionSharing({ sec, compact }: { sec: AboutSection; compact?: boolean }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const isElder = state.persona === "elder";
  const title = sectionTitle(sec.key);
  return (
    <div className={`stack about-share ${compact ? "compact" : ""}`} style={{ "--gap": "8px" } as CSSProperties} role="group" aria-label={`Who sees ${title}`}>
      {!compact && <b className="small">Who sees this</b>}
      {aboutCandidates(state).map((m) => {
        const on = sec.sharedWith.includes(m.id);
        return (
          <div key={m.id} className="row">
            <Avatar m={m} size={28} />
            <span className="grow small">{m.short} <span className="tiny">{m.role === "pro" ? "during shifts" : m.relation}</span></span>
            {isElder
              ? <Toggle checked={on} onChange={(v) => { actions.setAboutSharing(sec.key, v ? [...sec.sharedWith, m.id] : sec.sharedWith.filter((x) => x !== m.id)); toast(v ? `${m.short} can see ${title}` : `${m.short} can't see ${title}`); }} label={`${m.short} sees ${title}`} />
              : <span className={`badge ${on ? "green" : ""}`}>{on ? "Sees it" : "Doesn't"}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** CC-219 criterion 3: the parts Ana may see, on her shift screen, "How to help me" first. Nothing off shift. */
export function ShiftAboutMe() {
  const { state } = useStore();
  const me = meId(state.persona);
  const secs = shiftSections(state, me);
  if (secs.length === 0) return null;
  return (
    <section className="panel stack shift-about" style={{ "--gap": "10px" } as CSSProperties} aria-label="What matters to Maggie">
      <div className="row"><Heart size={20} color="var(--care)" aria-hidden="true" /><h2 className="notes-h grow" style={{ margin: 0 }}>What matters to Maggie</h2><Link to={`/app/${state.persona}/about-me`} className="link small">Open</Link></div>
      {secs.map((x) => (
        <div key={x.key} className="stack" style={{ "--gap": "2px" } as CSSProperties}>
          <b className="small">{sectionTitle(x.key)}</b>
          <p className="about-text-read">{x.text}</p>
        </div>
      ))}
    </section>
  );
}

/** Privacy Center: one sharing entry per section (CC-219) and the "Insurance and admin details" choice (CC-226). */
export function PrivacyAboutAndAdmin() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const isElder = state.persona === "elder";
  const base = isElder ? "/app/elder" : "/app/guardian";
  const admin = adminPeople(state);
  return (
    <>
      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="pc-about">
        <div className="row">
          <Heart size={30} color="var(--care)" style={{ flex: "none" }} aria-hidden="true" />
          <div className="grow"><b id="pc-about">What matters to {isElder ? "me" : "Maggie"}</b><p className="muted small">Each part is seen only by the people {isElder ? "you pick" : "Maggie picks"}. Caregivers see a part only during their shifts.</p></div>
          <button className="btn sm secondary" onClick={() => nav(`${base}/about-me`)}>Open</button>
        </div>
        {state.aboutMe.sections.length === 0 && <p className="tiny">Nothing written yet.</p>}
        {[...state.aboutMe.sections].sort((a, b) => order(a.key) - order(b.key)).map((sec) => (
          <div key={sec.key} className="stack pc-about-sec" style={{ "--gap": "6px" } as CSSProperties}>
            <b className="small">{sectionTitle(sec.key)}</b>
            <SectionSharing sec={sec} compact />
          </div>
        ))}
      </section>

      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="pc-admin">
        <div className="row">
          <Lock size={30} color="var(--blue)" style={{ flex: "none" }} aria-hidden="true" />
          <div className="grow"><b id="pc-admin">Insurance and admin details</b><p className="muted small">What was said on calls with {isElder ? "your" : "Maggie's"} insurer, pharmacy or agencies, who was spoken to, and reference numbers. Everyone else in the call log sees only who was called, when, and the next step.</p></div>
          <button className="btn sm secondary" onClick={() => nav(`${base}/calls`)}>Calls</button>
        </div>
        <div className="stack" style={{ "--gap": "8px" } as CSSProperties} role="group" aria-label="Who sees insurance and admin details">
          {adminCandidates(state).map((m) => {
            const on = admin.includes(m.id);
            return (
              <div key={m.id} className="row">
                <Avatar m={m} size={30} />
                <span className="grow">{m.short} <span className="tiny">{m.relation}</span></span>
                {isElder
                  ? <Toggle checked={on} onChange={(v) => { actions.setAdminTo(v ? [...admin, m.id] : admin.filter((x) => x !== m.id)); toast(v ? `${m.short} sees insurance and admin details` : `${m.short} won't see insurance and admin details`); }} label={`${m.short} sees insurance and admin details`} />
                  : <span className={`badge ${on ? "green" : ""}`}>{on ? "Sees them" : "Doesn't"}</span>}
              </div>
            );
          })}
          <p className="tiny">{isElder ? "Sarah always sees them. Only you and Sarah can show a full reference number." : "Only Maggie can change this. You always see them."}</p>
        </div>
      </section>
    </>
  );
}

const order = (k: AboutKey) => ["day", "food", "help", "avoid"].indexOf(k);
