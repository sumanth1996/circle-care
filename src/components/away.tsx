import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Plane, Phone, UserRoundCheck, Volume2 } from "lucide-react";
import { useStore } from "../data/store";
import { meId, member, nameOf, todayOf } from "../data/selectors";
import { activeAway, backupCandidates, coverSummary, coverView, currentAway, lastEnded, summaryLines, untilText, AWAY_MAX_DAYS } from "../data/away";
import { GUARDIAN } from "../data/demo";
import type { Alert, Away } from "../data/types";
import { Avatar, useSpeech, useToast } from "./ui";
import { addDays, fmtShortDay, fmtTime, ymd } from "../lib/time";
import "./sprint20.css";

const statusText = (s: ReturnType<typeof useStore>["state"], a: Away) => {
  const who = nameOf(s, a.backupId);
  if (a.status === "asked") return `Waiting for ${who} to answer`;
  if (a.status === "declined") return `${who} can't cover. Pick someone else.`;
  if (activeAway(s)) return `${who} is covering ${untilText(s, a.end)}`;
  return `${who} agreed to cover`;
};

/** CC-229, CC-230: Sarah's Away mode page, and the backup's view of their cover. */
export function AwayPage() {
  const { state } = useStore();
  const nav = useNavigate();
  const me = meId(state.persona);
  return (
    <div className="page narrow stack away-page" style={{ "--gap": "18px" } as CSSProperties}>
      <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>
      {me === GUARDIAN ? <SarahAway /> : <BackupAway />}
    </div>
  );
}

function SarahAway() {
  const { state, actions } = useStore();
  const toast = useToast();
  const a = currentAway(state);
  const today = todayOf(state);
  const candidates = backupCandidates(state);
  const [editing, setEditing] = useState(!a);
  const [start, setStart] = useState(a?.start ?? ymd(addDays(new Date(`${today}T12:00:00`), 1)));
  const [end, setEnd] = useState(a?.end ?? ymd(addDays(new Date(`${today}T12:00:00`), 7)));
  const [backup, setBackup] = useState(a?.status === "declined" || a?.maggieAsked ? "" : a?.backupId ?? candidates[0]?.id ?? "");
  const maxEnd = start ? ymd(addDays(new Date(`${start}T12:00:00`), AWAY_MAX_DAYS)) : undefined;
  const active = !!activeAway(state);
  const others = candidates.filter((m) => !(a && (a.status === "declined" || a.maggieAsked) && m.id === a.backupId));

  const save = () => {
    actions.setAway({ start, end, backupId: backup });
    setEditing(false);
    toast(`Asked ${nameOf(state, backup)} to cover. Maggie has been told`);
  };

  return (
    <>
      <div className="page-head"><div><p className="page-kicker">Away mode</p><h1>When you're away</h1></div></div>
      <p className="muted small">Pick the dates you're away and who covers. From the first day, the alerts you'd get that their own role can see go to them, and they take your place in the SOS order. Settings and the Privacy Center stay with you and Maggie.</p>

      {a && (
        <section className={`panel stack away-status ${a.status === "declined" || a.maggieAsked ? "warn" : active ? "on" : ""}`} style={{ "--gap": "10px" } as CSSProperties} aria-label="Your away dates">
          <div className="row">
            <Avatar m={member(state, a.backupId)!} size={44} />
            <div className="grow">
              <b>{statusText(state, a)}</b>
              <p className="muted small" style={{ margin: 0 }}>{fmtShortDay(a.start)} to {fmtShortDay(a.end)}</p>
            </div>
            {active ? <span className="badge green">Covering now</span> : null}
          </div>
          {a.maggieAsked && <p className="small away-note" role="status">Maggie would like someone other than {nameOf(state, a.backupId)} to cover. Pick someone else.</p>}
          <div className="row wrap" style={{ "--gap": "8px" } as CSSProperties}>
            {active && <button className="btn" onClick={() => { actions.imBack(); toast("Welcome back. Everything comes to you again"); }}>I'm back</button>}
            {!editing && <button className="btn secondary" onClick={() => { setEditing(true); if (a.status === "declined" || a.maggieAsked) setBackup(others[0]?.id ?? ""); }}>{a.status === "declined" || a.maggieAsked ? "Pick someone else" : "Change"}</button>}
            {!active && <button className="btn plain" onClick={() => { actions.imBack(); toast("Away dates cancelled"); }}>Cancel away dates</button>}
          </div>
        </section>
      )}

      {editing && (
        <form className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-label="Away dates" onSubmit={(e) => { e.preventDefault(); if (start && end && backup) save(); }}>
          <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
            <label className="field grow"><span>First day away</span><input className="input" type="date" aria-label="First day away" min={today} value={start} onChange={(e) => setStart(e.target.value)} required disabled={active} /></label>
            <label className="field grow"><span>Last day away</span><input className="input" type="date" aria-label="Last day away" min={start || today} max={maxEnd} value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          </div>
          <fieldset className="stack away-who" style={{ "--gap": "8px" } as CSSProperties}>
            <legend className="small"><b>Who covers</b></legend>
            {others.length === 0 && <p className="muted small">Nobody else in the family can cover. Invite someone from Circle first.</p>}
            {others.map((m) => (
              <label key={m.id} className="row away-pick">
                <input type="radio" name="backup" value={m.id} checked={backup === m.id} onChange={() => setBackup(m.id)} aria-label={m.short} />
                <Avatar m={m} size={34} />
                <span className="grow">{m.short} <span className="tiny">{m.relation}</span></span>
              </label>
            ))}
            <p className="tiny">Only family can cover. A paid caregiver's access stays limited to their shifts.</p>
          </fieldset>
          <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
            <button className="btn" disabled={!start || !end || !backup || end < start}>{backup ? `Ask ${nameOf(state, backup)} to cover` : "Ask them to cover"}</button>
            {a && <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
    </>
  );
}

function AlertRow({ a }: { a: Alert }) {
  return (
    <li className="away-alert">
      <span className="tiny">{fmtShortDay(a.at)} {fmtTime(new Date(a.at))}</span>
      <span>{a.detail.replace(/^Covering for Sarah\. /, "")}</span>
      {a.movedToSarah && <span className="badge">Sarah's now</span>}
    </li>
  );
}

function BackupAway() {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const v = coverView(state, me);
  if (!v) {
    return (
      <>
        <div className="page-head"><div><p className="page-kicker">Away mode</p><h1>Covering for Sarah</h1></div></div>
        <section className="panel"><p className="muted" style={{ margin: 0 }}>Sarah hasn't asked you to cover.</p></section>
      </>
    );
  }
  const { away: a, active, alerts } = v;
  const sum = coverSummary(state, a);
  return (
    <>
      <div className="page-head"><div><p className="page-kicker">Away mode</p><h1>Covering for Sarah</h1></div></div>
      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-label="Sarah's request">
        <p style={{ margin: 0 }}><b>{fmtShortDay(a.start)} to {fmtShortDay(a.end)}</b></p>
        {a.status === "asked" && (
          <>
            <p className="small" style={{ margin: 0 }}>Sarah asked you to cover while she's away. You'd get the alerts she would, for what you can already see, and you'd be first after Maggie's SOS goes off. You won't see anything new.</p>
            <div className="row" style={{ "--gap": "8px" } as CSSProperties}>
              <button className="btn" onClick={() => { actions.answerAway(true); toast("Thanks. Sarah and Maggie have been told"); }}>I'll cover</button>
              <button className="btn secondary" onClick={() => { actions.answerAway(false); toast("Sarah has been told"); }}>I can't</button>
            </div>
          </>
        )}
        {a.status === "accepted" && <p className="small" style={{ margin: 0 }}>{active ? `You're covering ${untilText(state, a.end)}.` : "You said you'll cover. It starts on the first day."}</p>}
        {a.status === "declined" && <p className="small" style={{ margin: 0 }}>You said you can't cover. Sarah will pick someone else.</p>}
        {a.status === "ended" && (
          <div className="stack away-thanks" style={{ "--gap": "6px" } as CSSProperties}>
            <b>Thank you for covering. Sarah is back.</b>
            <ul className="away-sum">{summaryLines(sum).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
      </section>
      {alerts.length > 0 && (
        <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties} aria-labelledby="away-alerts">
          <h2 id="away-alerts" className="notes-h" style={{ margin: 0 }}>Alerts while you covered</h2>
          <ul className="away-alerts">{alerts.map((x) => <AlertRow key={x.id} a={x} />)}</ul>
        </section>
      )}
    </>
  );
}

/** CC-229, CC-230: on Sarah's home, the covering line while she's away, then her one summary when she's back. */
export function AwayHome() {
  const { state, actions } = useStore();
  const a = currentAway(state);
  const last = lastEnded(state);
  if (a && activeAway(state)) {
    return (
      <section className="panel away-banner on row" aria-label="Away mode">
        <Plane size={22} color="var(--blue)" aria-hidden="true" />
        <span className="grow"><b>{nameOf(state, a.backupId)} is covering {untilText(state, a.end)}</b><span className="muted small" style={{ display: "block" }}>Your alerts go to them while you're away.</span></span>
        <Link className="btn secondary sm" to="/app/guardian/away">Away mode</Link>
      </section>
    );
  }
  if (a && (a.status === "declined" || a.maggieAsked || a.status === "asked")) {
    if (a.status === "asked" && !a.maggieAsked) return null;
    return (
      <section className="panel away-banner warn row" aria-label="Away mode">
        <Plane size={22} color="#9a6700" aria-hidden="true" />
        <span className="grow"><b>{a.maggieAsked ? "Maggie would like someone else to cover" : `${nameOf(state, a.backupId)} can't cover`}</b><span className="muted small" style={{ display: "block" }}>Pick someone else for {fmtShortDay(a.start)} to {fmtShortDay(a.end)}.</span></span>
        <Link className="btn sm" to="/app/guardian/away">Pick</Link>
      </section>
    );
  }
  if (!last || last.summarySeenAt || !last.summaryFor) return null;
  return <AwaySummary a={last} onSeen={() => actions.seenAwaySummary()} />;
}

/** CC-230 criterion 3: one summary of the time away, open alerts and tasks first. */
function AwaySummary({ a, onSeen }: { a: Away; onSeen: () => void }) {
  const { state } = useStore();
  const open = state.alerts.filter((x) => a.summaryFor!.open.includes(x.id));
  const rest = state.alerts.filter((x) => x.awayId === a.id && !a.summaryFor!.open.includes(x.id));
  const today = todayOf(state);
  const tasks = state.tasks.filter((t) => t.recurrence === "once" && t.assignee === GUARDIAN && t.date && t.date <= today && !state.taskLogs.some((l) => l.taskId === t.id));
  const backup = nameOf(state, a.backupId);
  return (
    <section className="panel stack away-summary" style={{ "--gap": "10px" } as CSSProperties} aria-label="While you were away">
      <div className="row"><UserRoundCheck size={22} color="var(--green)" aria-hidden="true" /><h2 className="notes-h grow" style={{ margin: 0 }}>While you were away</h2></div>
      <p className="small" style={{ margin: 0 }}>{backup} covered from {fmtShortDay(a.start)}{a.endedEarly ? " until you came back early" : ` to ${fmtShortDay(a.end)}`}: {a.summaryFor!.alerts} {a.summaryFor!.alerts === 1 ? "alert" : "alerts"}, {a.summaryFor!.tasksDone} {a.summaryFor!.tasksDone === 1 ? "task" : "tasks"} done{a.summaryFor!.sos ? `, ${a.summaryFor!.sos} SOS` : ""}.</p>
      {(open.length > 0 || tasks.length > 0) && (
        <div className="stack" style={{ "--gap": "6px" } as CSSProperties}>
          <b className="small">Still open, now yours</b>
          <ul className="away-alerts">
            {open.map((x) => <AlertRow key={x.id} a={x} />)}
            {tasks.map((t) => <li key={t.id} className="away-alert"><span className="tiny">{fmtShortDay(t.date!)}</span><span>{t.title}</span><span className="badge">Task</span></li>)}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <details>
          <summary className="small">What came to {backup}</summary>
          <ul className="away-alerts">{rest.map((x) => <AlertRow key={x.id} a={x} />)}</ul>
        </details>
      )}
      <button className="btn secondary sm" style={{ alignSelf: "flex-start" }} onClick={onSeen}><CheckCircle2 size={16} /> Got it</button>
    </section>
  );
}

/** CC-229: on the backup's home, the request to answer, or that they're covering. */
export function CoverCard() {
  const { state } = useStore();
  const me = meId(state.persona);
  const v = coverView(state, me);
  if (!v || v.away.status === "declined" || v.away.status === "ended") return null;
  const a = v.away;
  return (
    <Link to={`/app/${state.persona}/away`} className={`panel away-banner row ${v.active ? "on" : a.status === "asked" ? "warn" : ""}`} aria-label={a.status === "asked" ? "Sarah asked you to cover" : "Covering for Sarah"}>
      <Plane size={22} color="var(--blue)" aria-hidden="true" />
      <span className="grow"><b>{a.status === "asked" ? "Sarah asked you to cover" : v.active ? `Covering for Sarah ${untilText(state, a.end)}` : "You're covering for Sarah"}</b><span className="muted small" style={{ display: "block" }}>{fmtShortDay(a.start)} to {fmtShortDay(a.end)}</span></span>
    </Link>
  );
}

/** CC-231: on Maggie's home, who to call while Sarah is away, with Change and Read aloud. */
export function ElderCovering() {
  const { state, actions } = useStore();
  const { speak, supported } = useSpeech();
  const toast = useToast();
  const a = activeAway(state);
  const [asked, setAsked] = useState(false);
  useEffect(() => { setAsked(!!a?.maggieAsked); }, [a?.maggieAsked]);
  if (!a) return null;
  const who = member(state, a.backupId);
  const line = `${who?.short ?? "Someone"} is covering for Sarah ${untilText(state, a.end)}.`;
  return (
    <section className="elder-covering panel" aria-label="Who is covering">
      <div className="row">
        {who && <Avatar m={who} size={56} />}
        <p className="grow covering-line">{line}</p>
        {supported && state.settings.readAloud && <button className="btn secondary" style={{ width: 48, height: 48, padding: 0 }} aria-label="Read this to me" onClick={() => speak(line)}><Volume2 size={24} /></button>}
      </div>
      <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
        <Link to="/app/elder/call" className="btn lg grow"><Phone size={22} /> Call {who?.short}</Link>
        {asked ? <p className="small muted" role="status" style={{ margin: 0 }}>Sarah has been asked to pick someone else.</p>
          : <button className="btn secondary lg" onClick={() => { actions.askOtherBackup(); setAsked(true); toast("Sarah has been told"); }}>Change</button>}
      </div>
    </section>
  );
}
