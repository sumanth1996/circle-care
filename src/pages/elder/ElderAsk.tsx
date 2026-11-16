import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Car, ShoppingBasket, Coffee, Smartphone, Sparkles, Phone, Send, HandHeart } from "lucide-react";
import { useStore } from "../../data/store";
import { clock, member } from "../../data/selectors";
import { ELDER_HELP_KINDS, HELP_NOTE_MAX, helpFromPeople } from "../../data/help";
import { GUARDIAN } from "../../data/demo";
import type { HelpKind } from "../../data/types";
import { useSpeech, useToast } from "../../components/ui";
import { addDays, ymd } from "../../lib/time";
import "../../components/sprint17.css";

const ICON: Partial<Record<HelpKind, typeof Car>> = { groceries: ShoppingBasket, ride: Car, company: Coffee, phone: Smartphone, other: Sparkles };
const SAY: Partial<Record<HelpKind, string>> = { groceries: "groceries", ride: "a ride", company: "some company", phone: "help with your phone", other: "help" };

/**
 * CC-211: "I could use a hand". Maggie picks what she needs and which day, in big buttons that all fit on one
 * screen at her largest text, and taps Send. It goes to the people she allowed in her Privacy Center.
 */
export default function ElderAsk() {
  const { state, actions } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const { speak } = useSpeech();
  const now = clock(state);
  const people = helpFromPeople(state);
  const sarah = member(state, GUARDIAN);
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i));
  const [kind, setKind] = useState<HelpKind | null>(null);
  const [day, setDay] = useState(ymd(addDays(now, 1)));
  const [note, setNote] = useState("");

  useEffect(() => { actions.logView("her ask-for-help screen"); }, [actions]);

  if (!people.length) {
    return (
      <div className="page narrow stack" style={{ "--gap": "20px" } as CSSProperties}>
        <Link to="/app/elder" className="btn ghost ask-back"><ArrowLeft /> Home</Link>
        <h1 className="elder-hello">I could use a hand</h1>
        <section className="panel stack ask-empty" style={{ "--gap": "14px" } as CSSProperties}>
          <b>Ask Sarah to set up who can help</b>
          <p className="muted">No one can see your requests yet. You can choose people in My privacy, or Sarah can help you.</p>
          {sarah && <a className="btn lg block" href={`tel:${sarah.phone.replace(/[^+\d]/g, "")}`}><Phone size={22} /> Call Sarah</a>}
          <Link className="btn lg block secondary" to="/app/elder/privacy">Choose people</Link>
        </section>
      </div>
    );
  }

  const names = people.map((id) => member(state, id)?.short).filter(Boolean).join(" and ");
  const ok = !!kind && (kind !== "other" || note.trim().length > 0);
  const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" }));

  const send = () => {
    if (!ok || !kind) return;
    actions.askHelp({ kind, date: day, note: note.trim() });
    const i = days.findIndex((d) => ymd(d) === day);
    const msg = `Sent. ${names} will see you asked for ${SAY[kind]} ${i >= 0 ? dayLabel(days[i], i).toLowerCase() : ""}.`.replace(" .", ".");
    toast(msg);
    if (state.settings.readAloud) speak(msg);
    nav("/app/elder");
  };

  return (
    <div className="page narrow stack ask" style={{ "--gap": "18px" } as CSSProperties}>
      <Link to="/app/elder" className="btn ghost ask-back"><ArrowLeft /> Home</Link>
      <h1 className="elder-hello">I could use a hand</h1>
      <fieldset className="ask-kinds">
        <legend>What do you need?</legend>
        {ELDER_HELP_KINDS.map((k) => {
          const I = ICON[k.key] ?? Sparkles;
          return (
            <label key={k.key} className={kind === k.key ? "on" : ""}>
              <input type="radio" name="ask-kind" checked={kind === k.key} onChange={() => setKind(k.key)} />
              <I size={34} aria-hidden="true" />
              <span>{k.label}</span>
            </label>
          );
        })}
      </fieldset>
      {kind === "other" && (
        <label className="field ask-note"><span>What can someone do?</span>
          <textarea className="input" rows={2} maxLength={HELP_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type, or tap the microphone on your keyboard" />
          <span className="tiny">Only the words are kept, never a recording.</span>
        </label>
      )}
      <fieldset className="ask-days">
        <legend>Which day?</legend>
        {days.map((d, i) => (
          <label key={ymd(d)} className={day === ymd(d) ? "on" : ""}>
            <input type="radio" name="ask-day" checked={day === ymd(d)} onChange={() => setDay(ymd(d))} />
            {dayLabel(d, i)}
          </label>
        ))}
      </fieldset>
      <button className="btn lg block ask-send" disabled={!ok} onClick={send}><Send size={22} /> Send</button>
      <p className="small muted center"><HandHeart size={16} style={{ verticalAlign: "-3px" }} /> {names} will see it, and Sarah.</p>
    </div>
  );
}
