import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, HandHeart, Plus, Car, ShoppingBasket, Coffee, Home, Sparkles, Check, EyeOff, CalendarClock, PauseCircle, History, MapPin, Smartphone, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { clock, meId, member, nameOf, todayOf } from "../data/selectors";
import { can } from "../data/policy";
import { phiHint } from "../data/everyday";
import { HELP_KINDS, HELP_NOTE_MAX, askingDone, helpBoard, helpCandidates, helpHistory, helpView, helpWeek, whoDidWhat, whoDidLine, type HelpInput } from "../data/help";
import { ELDER, GUARDIAN } from "../data/demo";
import type { HelpKind, HelpRequest } from "../data/types";
import { Avatar, Segmented, Sheet, useToast } from "./ui";
import { HealthHint } from "./chat";
import { addDays, fmtShortDay, fmtTime, hm, toMin, fromMin, ymd } from "../lib/time";
import "./help.css";
import { CoverCard } from "./away";
import { MyNextSteps } from "./visitNotes";

const KIND_ICON: Record<HelpKind, typeof Car> = { ride: Car, groceries: ShoppingBasket, company: Coffee, visit: Home, phone: Smartphone, other: Sparkles };
const STATUS_LABEL: Record<HelpRequest["status"], string> = { open: "Open", claimed: "Taken", done: "Done", cancelled: "Cancelled" };

/**
 * CC-209, CC-210: the Help board. Sarah posts small asks for the people she picks; they claim and finish them.
 * The same board shows for Sarah, James, Ana and Maggie, each seeing only what the sharing rules allow.
 */
export function HelpBoard() {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const isGuardian = me === GUARDIAN;
  const isElder = me === ELDER;
  const canRespond = can(state, me, "respond", "help");
  const [compose, setCompose] = useState(false);
  const [cancel, setCancel] = useState<HelpRequest | null>(null);
  const [release, setRelease] = useState<HelpRequest | null>(null);
  const claiming = useRef<string | null>(null);
  const nav = useNavigate();

  useEffect(() => { actions.logView("the Help board"); }, [actions]);

  const board = helpBoard(state, me);
  const open = board.filter((r) => r.status === "open");
  const taken = board.filter((r) => r.status === "claimed");
  const done = board.filter((r) => r.status === "done").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const week = helpWeek(state, me);
  const history = helpHistory(state, me);
  const paused = state.settings.sharingPaused && !isElder && !isGuardian;

  // CC-210: two people can tap "I'll do it" at once. Only the first claim wins; the other sees who has it.
  useEffect(() => {
    const id = claiming.current;
    if (!id) return;
    const r = state.help.find((x) => x.id === id);
    claiming.current = null;
    if (!r) return;
    if (r.status === "claimed" && r.claimedBy === me) toast("You have this. Sarah has been told.");
    else if (r.status === "claimed" && r.claimedBy) toast(`${nameOf(state, r.claimedBy)} already has this`);
  }, [state, me, toast]);

  const claim = (r: HelpRequest) => { claiming.current = r.id; actions.claimHelp(r.id, r.rev); };

  return (
    <div className="page narrow stack help-board" style={{ "--gap": "18px" } as CSSProperties}>
      {isElder && <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder/privacy")}><ArrowLeft /> Privacy Center</button>}
      <div className="page-head">
        <div><p className="page-kicker">Maggie's circle</p><h1>Help board</h1></div>
        {isGuardian && <button className="btn" onClick={() => setCompose(true)}><Plus size={18} /> New request</button>}
      </div>

      {/* CC-218: James's next steps from visit notes sit at the top of his board. */}
      {state.persona === "family" && <CoverCard />}
      {state.persona === "family" && <MyNextSteps />}

      {paused ? (
        <section className="panel stack help-paused" style={{ "--gap": "8px" } as CSSProperties}>
          <PauseCircle size={28} color="var(--elder)" />
          <b>Maggie has paused sharing</b>
          <p className="muted small">Help requests are hidden until she turns sharing back on. SOS and the emergency card still work.</p>
        </section>
      ) : (
        <>
          <div className="help-stats" role="list" aria-label="Requests">
            <span role="listitem"><b>{open.length}</b> Open</span>
            <span role="listitem"><b>{taken.length}</b> Taken</span>
            <span role="listitem"><b>{done.length}</b> Done</span>
          </div>

          <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="help-open">
            <h2 id="help-open" className="help-h">Open</h2>
            {open.length === 0 && <p className="muted small help-empty">Nothing open right now.</p>}
            {open.map((r) => (
              <HelpCard key={r.id} r={r}>
                {r.remindedUnclaimed && isGuardian && <p className="small help-warn">No one has picked this up yet.</p>}
                <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
                  {canRespond && !isGuardian && <button className="btn" onClick={() => claim(r)}>I'll do it</button>}
                  {isGuardian && <button className="btn" onClick={() => claim(r)}>I'll do it myself</button>}
                  {isGuardian && r.remindedUnclaimed && <button className="btn secondary" onClick={() => { actions.repostHelp(r.id); toast("Sent again to the same people"); }}>Post again</button>}
                  {isGuardian && <button className="btn plain" onClick={() => setCancel(r)}>Cancel request</button>}
                </div>
              </HelpCard>
            ))}
          </section>

          <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="help-taken">
            <h2 id="help-taken" className="help-h">Taken</h2>
            {taken.length === 0 && <p className="muted small help-empty">No one has a request yet.</p>}
            {taken.map((r) => {
              const mine = r.claimedBy === me;
              return (
                <HelpCard key={r.id} r={r}>
                  <p className="help-has"><Avatar m={member(state, r.claimedBy!)} size={26} /> <b>{mine ? "You have this" : `${nameOf(state, r.claimedBy!)} has this`}</b></p>
                  {mine && askingDone(r, me) ? (
                    <div className="help-ask stack" style={{ "--gap": "8px" } as CSSProperties} role="group" aria-label="Did this happen?">
                      <b>Did this happen?</b>
                      <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
                        <button className="btn" onClick={() => { actions.finishHelp(r.id); toast("Marked done"); }}>Yes</button>
                        <button className="btn secondary" onClick={() => actions.notYetHelp(r.id)}>Not yet</button>
                      </div>
                    </div>
                  ) : (
                    <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
                      {mine && <button className="btn" onClick={() => { actions.finishHelp(r.id); toast("Marked done. Thank you"); }}><Check size={18} /> Mark done</button>}
                      {mine && <button className="btn secondary" onClick={() => setRelease(r)}>Can't anymore</button>}
                      {isGuardian && <button className="btn plain" onClick={() => setCancel(r)}>Cancel request</button>}
                    </div>
                  )}
                </HelpCard>
              );
            })}
          </section>

          <section className="stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="help-done">
            <h2 id="help-done" className="help-h">Done</h2>
            {done.length === 0 && <p className="muted small help-empty">Finished requests show here for 30 days.</p>}
            {done.length > 0 && (
              <div className="list">
                {done.map((r) => {
                  const v = helpView(state, me, r);
                  return (
                    <div key={r.id} className="list-row help-done-row">
                      <Check size={20} color="var(--green)" style={{ flex: "none" }} />
                      <span className="grow"><span className="list-title" style={{ display: "block" }}>{v.title}</span><span className="list-sub">Done by {nameOf(state, r.doneBy!)} · {fmtShortDay(r.closedAt!)} at {fmtTime(new Date(r.closedAt!))}</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

{isGuardian || isElder ? <WhoDidWhat /> : (
                    <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="help-week">
            <h2 id="help-week" className="help-h" style={{ margin: 0 }}>Who helped this week</h2>
            {week.length === 0 ? <p className="muted small">Nothing finished in the last 7 days.</p> : (
              <ul className="help-week">
                {week.map((w) => (
                  <li key={w.id}><Avatar m={member(state, w.id)} size={32} /><span><b>{w.name}</b><span className="muted small" style={{ display: "block" }}>{w.did.join(", ")}</span></span></li>
                ))}
              </ul>
            )}
            <p className="tiny">Names are in A to Z order. Nobody is ranked.</p>
          </section>
          )}

          {history.length > 0 && (
            <details className="panel help-history">
              <summary><History size={18} /> History <span className="tiny">Only {isElder ? "you and Sarah" : "you and Maggie"} can see this</span></summary>
              <ul>
                {history.map((r) => (
                  <li key={r.id}>
                    <span className="row between"><b>{helpView(state, me, r).title}</b><span className={`badge ${r.status === "done" ? "green" : r.status === "cancelled" ? "" : "blue"}`}>{STATUS_LABEL[r.status]}</span></span>
                    <span className="tiny" style={{ display: "block" }}>{r.history.map((h) => `${h.change} by ${nameOf(state, h.by)}, ${fmtShortDay(h.at)} ${fmtTime(new Date(h.at))}`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {compose && <NewHelp onClose={() => setCompose(false)} onPosted={() => { setCompose(false); toast("Request posted"); }} />}
      {cancel && (
        <Sheet title="Cancel this request?" onClose={() => setCancel(null)}>
          <div className="stack">
            <p>It leaves everyone's Help board.{cancel.claimedBy ? ` ${nameOf(state, cancel.claimedBy)} will be told.` : ""} It stays in the history you and Maggie can see.</p>
            <button className="btn lg block danger" onClick={() => { actions.cancelHelp(cancel.id); setCancel(null); toast("Request cancelled"); }}>Cancel request</button>
            <button className="btn lg block plain" onClick={() => setCancel(null)}>Keep it</button>
          </div>
        </Sheet>
      )}
      {release && (
        <Sheet title="Can't do this anymore?" onClose={() => setRelease(null)}>
          <div className="stack">
            <p>It opens again for the circle, and Sarah is told.</p>
            <button className="btn lg block" onClick={() => { actions.releaseHelp(release.id); setRelease(null); toast("It's open again"); }}>Yes, open it again</button>
            <button className="btn lg block plain" onClick={() => setRelease(null)}>I can still do it</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function HelpCard({ r, children }: { r: HelpRequest; children?: React.ReactNode }) {
  const { state } = useStore();
  const me = meId(state.persona);
  const v = helpView(state, me, r);
  const Icon = v.masked ? CalendarClock : KIND_ICON[r.kind];
  const audience = r.audience.map((id) => member(state, id)?.short ?? nameOf(state, id)).join(", ");
  return (
    <article className="panel help-card stack" style={{ "--gap": "10px" } as CSSProperties} aria-label={v.title}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span className="help-icon"><Icon size={20} /></span>
        <div className="grow">
          <h3 className="help-title">{v.title}</h3>
          <p className="muted small">{v.when} · asked by {nameOf(state, r.by)}</p>
        </div>
      </div>
      {v.note && <p className="help-note">{v.note}</p>}
      {v.place && <p className="small help-place"><MapPin size={15} /> {v.place}</p>}
      {r.appointmentId && !v.masked && (me === GUARDIAN || me === ELDER) && <p className="tiny"><EyeOff size={13} style={{ verticalAlign: "-2px" }} /> Shows as an appointment only. The doctor and the reason stay hidden from the circle.</p>}
      {me === GUARDIAN && <p className="tiny">Who can see it: {audience}, and Maggie</p>}
      {children}
    </article>
  );
}

type Who = "all" | "family" | "pick";

/** CC-209: Sarah's new request. The note gets the same health-detail check as the family chat before it's posted. */
function NewHelp({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { state, actions } = useStore();
  const now = clock(state);
  const people = helpCandidates(state);
  const upcoming = useMemo(() => state.appointments.filter((a) => a.status === "scheduled" && a.date >= todayOf(state)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [state]);
  const [kind, setKind] = useState<HelpKind>("ride");
  const [apptId, setApptId] = useState("");
  const [date, setDate] = useState(ymd(addDays(now, 1)));
  const [time, setTime] = useState(hm(now).slice(0, 2) + ":00");
  const [note, setNote] = useState("");
  const [who, setWho] = useState<Who>("all");
  const [picked, setPicked] = useState<string[]>(people.map((m) => m.id));
  const [hint, setHint] = useState<string[] | null>(null);

  const audience = who === "all" ? people.map((m) => m.id) : who === "family" ? people.filter((m) => m.role === "family").map((m) => m.id) : picked;
  const ok = audience.length > 0 && !!date && !!time && (kind !== "other" || note.trim().length > 0);

  const pickAppt = (id: string) => {
    setApptId(id);
    const a = state.appointments.find((x) => x.id === id);
    if (a) { setDate(a.date); setTime(kind === "ride" ? fromMin(Math.max(0, toMin(a.time) - 30)) : a.time); }
  };
  const input = (): HelpInput => ({ kind, note: note.trim(), date, time, appointmentId: apptId || undefined, audience });
  const post = () => { actions.postHelp(input()); onPosted(); };
  const submit = () => {
    if (!ok) return;
    const spotted = phiHint(state, note);
    if (spotted.length) setHint(spotted);
    else post();
  };

  if (hint) {
    return (
      <HealthHint text={note.trim()} spotted={hint} canNote={false} onNote={() => undefined} onSend={post} onEdit={() => setHint(null)}
        sendLabel="Post anyway" intro="Help requests go to the people you pick. Health details are safer on Maggie's record, where her sharing choices decide who sees them."
        noNoteText="Edit the request to leave the health detail out, or post it anyway." />
    );
  }

  return (
    <Sheet title="New request" onClose={onClose}>
      <form className="stack" style={{ "--gap": "14px" } as CSSProperties} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <fieldset className="help-kinds">
          <legend className="help-legend">What</legend>
          {HELP_KINDS.map((k) => {
            const I = KIND_ICON[k.key];
            return <label key={k.key} className={kind === k.key ? "on" : ""}><input type="radio" name="help-kind" checked={kind === k.key} onChange={() => setKind(k.key)} /><I size={16} aria-hidden="true" /> {k.label}</label>;
          })}
        </fieldset>
        <label className="field"><span>Tied to an appointment?</span>
          <select className="input" value={apptId} onChange={(e) => pickAppt(e.target.value)}>
            <option value="">No</option>
            {upcoming.map((a) => <option key={a.id} value={a.id}>{a.title}, {fmtShortDay(a.date)} {fmtTime(a.time)}</option>)}
          </select>
        </label>
        {apptId && <p className="tiny help-masked"><EyeOff size={14} style={{ verticalAlign: "-2px" }} /> Shows as an appointment only. The doctor and the reason stay hidden from the circle.</p>}
        <div className="grid-2">
          <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="field"><span>Time</span><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
        </div>
        <label className="field"><span>Note{kind === "other" ? "" : " (optional)"}</span>
          <textarea className="input" rows={2} maxLength={HELP_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pick Mom up at 9 and bring her home after" />
        </label>
        <div className="field">
          <span className="label">Who can see it</span>
          <div className="help-who"><Segmented<Who> label="Who can see it" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone in the circle" }, { value: "family", label: "Family only" }, { value: "pick", label: "Choose people" }]} /></div>
          {who === "pick" && (
            <div className="stack help-people" style={{ "--gap": "6px" } as CSSProperties}>
              {people.map((m) => (
                <label key={m.id} className="row"><input type="checkbox" checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} style={{ width: 20, height: 20 }} /> {m.name}</label>
              ))}
            </div>
          )}
          <p className="tiny">{audience.length ? `${audience.map((id) => member(state, id)?.short).join(", ")} will see it, and Maggie.` : "Pick at least one person."}</p>
        </div>
        <button className="btn lg block" disabled={!ok}><HandHeart size={20} /> Post</button>
        <p className="tiny center">Each person gets “New help request in Circle Care”. The lock screen never shows the details.</p>
      </form>
    </Sheet>
  );
}

/**
 * CC-212: Who did what this week, for Sarah and Maggie. Everyone who helped, A to Z, with what they did and how
 * many. Nobody is ranked and nothing is counted as missed. Maggie's version has a Thank button that sends a short
 * note in the family chat; someone who has left the circle still shows, without one.
 */
function WhoDidWhat() {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const isElder = me === ELDER;
  const rows = whoDidWhat(state, me);
  const [thanked, setThanked] = useState<string[]>([]);
  return (
    <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="help-who-did">
      <h2 id="help-who-did" className="help-h" style={{ margin: 0 }}>{isElder ? "Who helped you this week" : "Who did what this week"}</h2>
      {rows.length === 0 ? <p className="muted small">Nothing in the last 7 days yet.</p> : (
        <ul className="help-week">
          {rows.map((w) => (
            <li key={w.id}>
              <Avatar m={member(state, w.id)} size={32} />
              <span className="grow"><b>{w.name}</b>{w.left && <span className="tiny"> · no longer in the circle</span>}<span className="muted small" style={{ display: "block" }}>{whoDidLine(w)}</span></span>
              {isElder && !w.left && (thanked.includes(w.id)
                ? <span className="small help-thanked"><Check size={16} /> Thanked</span>
                : <button className="btn secondary" aria-label={`Thank ${w.name}`} onClick={() => { actions.thank(w.id); setThanked([...thanked, w.id]); toast(`Your thank-you is in the family chat`); }}><Heart size={16} /> Thank</button>)}
            </li>
          ))}
        </ul>
      )}
      <p className="tiny">Help requests, care tasks and visits in the last 7 days. Names are in A to Z order. Nobody is ranked.</p>
    </section>
  );
}
