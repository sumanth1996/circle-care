import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Phone, Volume2, Shield, Type, Bell, IdCard, Sun, CheckCircle2, MessageCircleHeart, HandHeart, ListChecks, Heart, PhoneCall } from "lucide-react";
import { useStore } from "../../data/store";
import { DailyCheckins } from "../../components/everyday";
import { ElderChatTile } from "../../components/chat";
import { nextUp, clock, checkinToday, checkinButtonShows, member, isOpen, todayOf } from "../../data/selectors";
import { Avatar, PillArt, taskIcons, IconTile, useSpeech, useToast } from "../../components/ui";
import { fmtTime, fmtDay, greeting } from "../../lib/time";
import { elderHelpLines } from "../../data/help";
import { MyNextSteps } from "../../components/visitNotes";
import { ElderCovering } from "../../components/away";
import { activeAway } from "../../data/away";
import "./elder.css";

/** CC-68: elder home with three big actions — What's next, SOS, Call my person.
 *  CC-142: optional one-tap check-ins below them. CC-165: the family chat tile, unless Maggie hides it. */
export default function ElderHome() {
  const { state, actions } = useStore();
  const { speak, supported } = useSpeech();
  const toast = useToast();
  const now = clock(state);
  const n = nextUp(state);
  // CC-231: while Sarah is away, the person covering is who Maggie calls first.
  const cover = activeAway(state)?.backupId;
  const favAll = state.members.filter((m) => m.status === "active" && (m.favorite || m.id === cover));
  const favorites = [...favAll.filter((m) => m.id === cover), ...favAll.filter((m) => m.id !== cover)];
  const first = favorites[0];
  const newDecisions = state.approvals.filter((a) => a.status !== "pending" && a.elderSeen === false).length;
  // Shows from an hour before her window, until a window that ends after midnight has ended (CC-199).
  const showCheckin = checkinButtonShows(state);
  const done = checkinToday(state);
  const hour = now.getHours();
  const asked = elderHelpLines(state);

  useEffect(() => { actions.logView("her home screen"); }, [actions]);

  let label = "Up next";
  let title = "Nothing else today";
  let sub = "Enjoy your day.";
  let late = false;
  let art: React.ReactNode = <IconTile icon={CheckCircle2} color="var(--green)" size={64} />;
  let say = "You're all done for today.";
  if (n.kind === "dose") {
    const d = n.slot;
    late = isOpen(d);
    const lastNight = d.date !== todayOf(state);
    label = lastNight ? `From last night · ${fmtTime(d.time)}` : late ? `Time for your medicine · ${fmtTime(d.time)}` : `Up next · ${fmtTime(d.time)}`;
    title = d.med.name;
    sub = lastNight ? "Let us know if you took it." : `${d.med.dose}. ${d.med.instructions}`;
    art = <PillArt med={d.med} size={64} />;
    say = lastNight
      ? `${d.med.name} was due last night at ${fmtTime(d.time)}. Let us know if you took it.`
      : `${late ? "It's time for" : "Next is"} ${d.med.name}, ${d.med.dose}, at ${fmtTime(d.time)}. ${d.med.instructions}`;
  } else if (n.kind === "task") {
    label = `Up next · ${fmtTime(n.task.time)}`;
    title = n.task.title;
    sub = n.task.assignee === "caregiver" ? `With ${member(state, "m-ana")?.short ?? "your caregiver"}` : "Just for you";
    art = <IconTile icon={taskIcons[n.task.icon] ?? CheckCircle2} color="var(--care)" size={64} />;
    say = `Next is ${n.task.title} at ${fmtTime(n.task.time)}.`;
  }

  return (
    <div className="page stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div>
        <p className="elder-date">{fmtDay(now)}</p>
        <h1 className="elder-hello">{greeting(now)}, Maggie</h1>
      </div>

      {showCheckin && (
        <div className="elder-checkin" role="region" aria-label="Daily check-in">
          <Sun size={40} color="var(--elder)" style={{ flex: "none" }} />
          <div className="grow"><b>{hour >= 5 && hour < 12 ? "How are you this morning?" : "How are you doing?"}</b><p className="muted" style={{ fontSize: "0.85em" }}>Let Sarah know you're OK.</p></div>
          <button className="btn lg" style={{ background: "var(--elder)" }} onClick={() => { actions.elderCheckin(); toast("Sarah will see you're OK"); if (state.settings.readAloud) speak("Thank you. Sarah will see you're OK."); }}>I'm OK</button>
        </div>
      )}
      {!showCheckin && done && <p className="small muted" style={{ marginTop: -8 }}><CheckCircle2 size={16} color="var(--green)" style={{ verticalAlign: "-3px" }} /> You checked in at {fmtTime(done.at)}</p>}

      <ElderCovering />

      <div className="elder-tiles">
        <div style={{ position: "relative" }}>
          <Link to="/app/elder/next" className={`elder-tile next ${late ? "late" : ""}`} aria-label={`${label}: ${title}. ${sub}`}>
            {art}
            <span className="grow">
              <span className="k" style={{ display: "block", color: late ? "#9a4f00" : undefined }}>{label}</span>
              <span className="v" style={{ display: "block" }}>{title}</span>
              <span className="s" style={{ display: "block" }}>{sub}</span>
            </span>
          </Link>
          {supported && state.settings.readAloud && (
            <button className="btn secondary" style={{ position: "absolute", top: 14, right: 14, width: 48, height: 48, padding: 0 }} aria-label="Read this to me" onClick={() => speak(say)}><Volume2 size={24} /></button>
          )}
        </div>
        <Link to="/app/elder/sos" className="elder-tile sos" aria-label="SOS. Get help now">SOS</Link>
        <Link to="/app/elder/call" className="elder-tile call">
          {first ? <Avatar m={first} size={64} /> : <Phone />}
          <span className="grow"><span className="k" style={{ display: "block", color: "#1a7f37" }}>Call my person</span><span className="v" style={{ display: "block" }}>{first?.short ?? "Family"}{favorites.length > 1 ? ` and ${favorites.length - 1} more` : ""}</span></span>
          <Phone size={32} />
        </Link>
        {/* CC-211: ask the circle for a hand. */}
        <Link to="/app/elder/ask" className="elder-tile hand">
          <HandHeart size={56} aria-hidden="true" />
          <span className="grow"><span className="v" style={{ display: "block" }}>I could use a hand</span><span className="s" style={{ display: "block" }}>Groceries, a ride, company</span></span>
        </Link>
      </div>

      {asked.length > 0 && (
        <section className="panel stack elder-asked" style={{ "--gap": "10px" } as React.CSSProperties} aria-label="Help you asked for">
          {asked.map((l) => <p key={l.id} className={l.claimed ? "yes" : ""}>{l.claimed ? <CheckCircle2 size={22} color="var(--green)" aria-hidden="true" /> : <HandHeart size={22} aria-hidden="true" />} {l.text}</p>)}
        </section>
      )}

      <MyNextSteps />

      <ElderChatTile />

      <DailyCheckins />

      <nav className="elder-links" aria-label="More">
        <Link to="/app/elder/chat"><MessageCircleHeart size={20} /> Family</Link>
        <Link to="/app/elder/decisions"><Bell size={20} /> Updates about me {newDecisions > 0 && <span className="new" aria-label={`${newDecisions} new`} />}</Link>
        <Link to="/app/elder/questions"><ListChecks size={20} /> Questions for the doctor</Link>
        <Link to="/app/elder/about-me"><Heart size={20} /> What matters to me</Link>
        <Link to="/app/elder/calls"><PhoneCall size={20} /> Calls about my care</Link>
        <Link to="/app/elder/privacy"><Shield size={20} /> My privacy</Link>
        <Link to="/app/elder/card"><IdCard size={20} /> Emergency card</Link>
        <Link to="/app/elder/settings"><Type size={20} /> Text size</Link>
      </nav>
    </div>
  );
}
