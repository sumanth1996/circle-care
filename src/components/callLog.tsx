import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarCheck, CheckCircle2, Eye, Lock, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useStore } from "../data/store";
import { meId, member, nameOf, todayOf } from "../data/selectors";
import { callOrgs, callsFor, canEditCalls, canSeeCalls, doneBy, ORG_MAX, CONTACT_MAX, OUTCOME_MAX, REF_MAX, STEP_MAX, type CallInput, type CallView } from "../data/callLog";
import { stepOwners } from "../data/visitNotes";
import { phiHint } from "../data/everyday";
import { ELDER } from "../data/demo";
import { Sheet, useToast } from "./ui";
import { HealthHint } from "./chat";
import { fmtShortDay, fmtTime } from "../lib/time";
import "./sprint19.css";

/**
 * CC-226 – CC-228: the call log. Sarah or Maggie writes down each call with an insurer, a pharmacy or an agency.
 * Everyone who can see it gets the organization, the date and the next step; the rest needs Maggie's
 * "Insurance and admin details" choice. Filter by organization to quote what was said before.
 */
export function CallLogPage() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const me = meId(state.persona);
  const elder = state.persona === "elder";
  const [org, setOrg] = useState("");
  const [editing, setEditing] = useState<CallView | "new" | null>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const filter = org.trim();
  const calls = callsFor(state, me, filter || undefined);
  const orgs = callOrgs(state, me);
  const canEdit = canEditCalls(state, me);

  useEffect(() => { actions.logView("the call log"); }, [actions]);

  const back = <button className="btn ghost notes-back" onClick={() => nav(-1)}><ArrowLeft /> Back</button>;
  const kicker = <p className="page-kicker">Calls</p>;

  if (!canSeeCalls(state, me)) {
    return (
      <div className="page narrow stack" style={{ "--gap": "16px" } as CSSProperties}>
        {back}
        <div className="page-head"><div>{kicker}<h1>Call log</h1></div></div>
        <section className="panel stack" style={{ "--gap": "8px" } as CSSProperties}>
          <Lock size={24} color="var(--muted)" />
          <b>Not shared with you right now</b>
          <p className="muted small">{state.persona === "caregiver" ? "You can see the call log during your shifts, while Maggie shares it." : "Maggie's sharing choices keep the call log private right now."}</p>
        </section>
      </div>
    );
  }

  const reveal = (id: string) => {
    if (shown[id]) { setShown({ ...shown, [id]: false }); return; }
    actions.revealCallRef(id);
    setShown({ ...shown, [id]: true });
  };
  const refOf = (id: string) => state.calls.find((c) => c.id === id)?.ref;

  return (
    <div className={`page narrow stack call-log ${elder ? "elder-calls" : ""}`} style={{ "--gap": "18px" } as CSSProperties}>
      {back}
      <div className="page-head">
        <div>{kicker}<h1>{elder ? "Calls about my care" : "Call log"}</h1></div>
        {canEdit && <button className="btn" onClick={() => setEditing("new")}><Plus size={18} /> {elder ? "Write down a call" : "Log a call"}</button>}
      </div>
      <p className="muted small calls-intro">{elder ? "Calls you or Sarah made to your insurance, your pharmacy or an agency, so nobody has to call twice." : "Calls with Maggie's insurer, pharmacy or agencies: who you spoke to, what they agreed and the reference number."}</p>

      <label className="field calls-filter">
        <span><Search size={16} aria-hidden="true" /> {elder ? "Who was called" : "Organization"}</span>
        <input className="input" list="call-orgs" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={elder ? "Type a name, like your pharmacy" : "All organizations"} aria-label="Filter by organization" />
        <datalist id="call-orgs">{orgs.map((o) => <option key={o} value={o} />)}</datalist>
      </label>
      {orgs.length > 0 && (
        <div className="row wrap calls-chips" role="group" aria-label="Organizations">
          {orgs.map((o) => <button key={o} type="button" className={`chip ${filter.toLowerCase() === o.toLowerCase() ? "on" : ""}`} aria-pressed={filter.toLowerCase() === o.toLowerCase()} onClick={() => setOrg(filter.toLowerCase() === o.toLowerCase() ? "" : o)}>{o}</button>)}
        </div>
      )}

      {calls.length === 0 ? (
        <section className="panel calls-empty"><Phone size={22} color="var(--muted)" aria-hidden="true" /> <span>{filter ? "No calls with this organization yet" : "No calls written down yet."}</span></section>
      ) : (
        <ul className="calls-list" aria-label="Calls">
          {calls.map((c) => (
            <li key={c.id} className="panel stack" style={{ "--gap": "8px" } as CSSProperties} aria-label={`${c.org}, ${fmtShortDay(c.date)}`}>
              <div className="row">
                <Phone size={20} color="var(--blue)" aria-hidden="true" />
                <b className="grow">{c.org}</b>
                <span className="tiny">{fmtShortDay(c.date)}</span>
              </div>
              {c.admin ? (
                <>
                  {c.admin.contact && <p className="small"><span className="muted">{elder ? "Spoke to" : "Spoke with"}</span> {c.admin.contact}</p>}
                  {c.admin.outcome && <p className="call-outcome">{c.admin.outcome}</p>}
                  {c.admin.refMasked && (
                    <p className="small row call-ref">
                      <span className="muted">Reference</span>
                      <span className="mono" aria-label={shown[c.id] ? `Reference ${refOf(c.id)}` : "Reference, last 4 shown"}>{shown[c.id] ? refOf(c.id) : c.admin.refMasked}</span>
                      {c.canReveal && <button className="btn plain sm" onClick={() => reveal(c.id)} aria-label={shown[c.id] ? `Hide reference for ${c.org}` : `Show reference for ${c.org}`}><Eye size={16} /> {shown[c.id] ? "Hide" : "Show"}</button>}
                    </p>
                  )}
                </>
              ) : (
                <p className="tiny"><Lock size={12} aria-hidden="true" /> What was said is private to Maggie and Sarah.</p>
              )}
              {c.nextStep && <StepLine c={c} me={me} />}
              {canEdit && (
                <div className="row call-actions">
                  <button className="btn secondary sm" onClick={() => setEditing(c)} aria-label={`Change the call with ${c.org}`}><Pencil size={16} /> Change</button>
                  <button className="btn plain sm" onClick={() => { actions.deleteCall(c.id); toast("Call removed"); }} aria-label={`Delete the call with ${c.org}`}><Trash2 size={16} /> Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <CallForm call={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StepLine({ c, me }: { c: CallView; me: string }) {
  const { state } = useStore();
  const st = c.nextStep!;
  const owner = st.owner === me ? "You" : st.owner === ELDER ? "Maggie" : member(state, st.owner)?.short ?? nameOf(state, st.owner);
  return (
    <div className={`call-step ${st.done ? "done" : st.overdue ? "late" : ""}`} aria-label={`Next step: ${st.text}`}>
      {st.done ? <CheckCircle2 size={18} color="var(--green)" aria-hidden="true" /> : <CalendarCheck size={18} color={st.overdue ? "#9a6700" : "var(--blue)"} aria-hidden="true" />}
      <span className="grow">
        <b>Next step:</b> {st.text}
        <span className="muted small" style={{ display: "block" }}>
          {owner} · {fmtShortDay(st.date)}
          {st.done ? ` · Done by ${doneBy(state, me, st.done.by)}, ${fmtShortDay(st.done.at)} ${fmtTime(new Date(st.done.at))}` : st.overdue ? " · Overdue" : ""}
        </span>
      </span>
    </div>
  );
}

function CallForm({ call, onClose }: { call: CallView | null; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const me = meId(state.persona);
  const raw = call ? state.calls.find((c) => c.id === call.id) : undefined;
  const owners = stepOwners(state);
  const today = todayOf(state);
  const stepDone = !!raw?.nextStep && state.taskLogs.some((l) => l.taskId === raw.nextStep!.taskId);
  const [org, setOrg] = useState(raw?.org ?? "");
  const [date, setDate] = useState(raw?.date ?? today);
  const [contact, setContact] = useState(raw?.contact ?? "");
  const [outcome, setOutcome] = useState(raw?.outcome ?? "");
  const [ref, setRef] = useState(raw?.ref ?? "");
  const [stepText, setStepText] = useState(raw?.nextStep?.text ?? "");
  const [stepOwner, setStepOwner] = useState(raw?.nextStep?.owner ?? me);
  const [stepDate, setStepDate] = useState(raw?.nextStep?.date && raw.nextStep.date >= today ? raw.nextStep.date : today);
  const [hint, setHint] = useState<string[] | null>(null);
  const label = (id: string) => (id === me ? "You" : id === ELDER ? "Maggie" : member(state, id)?.short ?? nameOf(state, id));

  const input = (): CallInput => ({ org, date, contact, outcome, ref, step: stepDone ? undefined : stepText.trim() ? { text: stepText, owner: stepOwner, date: stepDate } : null });
  const save = () => {
    actions.saveCall(input(), raw?.id);
    toast(raw ? "Call updated" : stepText.trim() && stepOwner !== me ? `Call saved. ${label(stepOwner)} gets the next step as a task` : "Call saved");
    onClose();
  };
  const submit = () => {
    if (!org.trim() || !date) return;
    const spotted = phiHint(state, `${outcome} ${stepText}`);
    if (spotted.length) setHint(spotted); else save();
  };

  return (
    <Sheet title={raw ? "Change the call" : "Log a call"} onClose={onClose}>
      <form className="stack call-form" style={{ "--gap": "12px" } as CSSProperties} aria-label="Call" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="field"><span>Organization</span><input className="input" aria-label="Organization" list="call-orgs-form" maxLength={ORG_MAX} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. Bayside Health Plan" required /></label>
        <datalist id="call-orgs-form">{callOrgs(state, me).map((o) => <option key={o} value={o} />)}</datalist>
        <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
          <label className="field grow"><span>Date of the call</span><input className="input" aria-label="Date of the call" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="field grow"><span>Spoke with</span><input className="input" aria-label="Spoke with" maxLength={CONTACT_MAX} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name and team" /></label>
        </div>
        <label className="field"><span>What they agreed</span><textarea className="input" aria-label="What they agreed" rows={3} maxLength={OUTCOME_MAX} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></label>
        <label className="field"><span>Reference number</span><input className="input mono" aria-label="Reference number" maxLength={REF_MAX} value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" /></label>
        <fieldset className="stack call-step-fields" style={{ "--gap": "10px" } as CSSProperties}>
          <legend className="small"><b>Next step</b> <span className="muted">(optional)</span></legend>
          {stepDone ? <p className="small muted">The next step is done, so it stays as it was.</p> : (
            <>
              <label className="field"><span>Next step</span><input className="input" aria-label="Next step" maxLength={STEP_MAX} value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder="e.g. Call back if no letter comes" /></label>
              <div className="row wrap" style={{ "--gap": "10px" } as CSSProperties}>
                <label className="field grow"><span>Who</span>
                  <select className="input" aria-label="Who" value={stepOwner} onChange={(e) => setStepOwner(e.target.value)}>
                    {owners.map((m) => <option key={m.id} value={m.id}>{label(m.id)}</option>)}
                  </select>
                </label>
                <label className="field grow"><span>By when</span><input className="input" aria-label="By when" type="date" min={today} value={stepDate} onChange={(e) => setStepDate(e.target.value)} /></label>
              </div>
              <p className="tiny">It becomes a task for that person, with a reminder the day before. Their task shows the organization and the step, never the reference number.</p>
            </>
          )}
        </fieldset>
        <button className="btn lg" disabled={!org.trim() || !date}>Save call</button>
        <p className="tiny">The outcome, who you spoke with and the reference number are insurance and admin details. Only Maggie, Sarah and the people Maggie picks see them.</p>
      </form>
      {hint && <HealthHint text={`${outcome} ${stepText}`.trim()} spotted={hint} canNote={false} onNote={() => undefined} onSend={save} onEdit={() => setHint(null)} sendLabel="Save anyway" intro="Calls are shared with the circle. Health details are safer on Maggie's record, where her sharing choices decide who sees them." noNoteText="Edit the call to leave the health detail out, or save it anyway." />}
    </Sheet>
  );
}
