import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Home, Siren, Phone, Volume2, Type, Shield, Bell, Sun, IdCard, LogIn, Pill, ListChecks, ClipboardCheck, CalendarClock, Repeat, Lock,
  LayoutDashboard, CheckCircle2, Users, Activity, BarChart3, FileText, CalendarX2, Mic, type LucideIcon,
} from "lucide-react";
import { SitePage, PageHero } from "../../components/Site";
import { Segmented } from "../../components/ui";

type F = { icon: LucideIcon; title: string; body: string };
const sets: Record<"elder" | "caregiver" | "guardian", { color: string; soft: string; items: F[] }> = {
  elder: {
    color: "var(--elder)", soft: "var(--elder-soft)",
    items: [
      { icon: Home, title: "Three-button home", body: "What's next, SOS and Call my person. No menus to get lost in." },
      { icon: Volume2, title: "Read aloud", body: "Reminders, consent and confirmations can be spoken — generated on the phone itself." },
      { icon: Mic, title: "Confirm by voice", body: "Say “I took it” to record a dose without touching the screen." },
      { icon: Siren, title: "Hold-to-send SOS", body: "Two-second hold, ten seconds to cancel, then the family is alerted in order." },
      { icon: Sun, title: "Daily “I'm OK”", body: "One tap each morning replaces the worried check-in call." },
      { icon: Phone, title: "Call my person", body: "Big photos of up to three favorite people, one tap to call." },
      { icon: Type, title: "Text that fits her eyes", body: "Three text sizes, high contrast and large touch targets." },
      { icon: Shield, title: "Privacy Center", body: "Who can see what, who looked, pause sharing, download everything." },
      { icon: IdCard, title: "Emergency card", body: "Allergies, medicines and contacts for first responders — approved by Maggie." },
    ],
  },
  caregiver: {
    color: "var(--care)", soft: "var(--care-soft)",
    items: [
      { icon: LogIn, title: "Verified check-in", body: "Location confirmed once at the door. The care plan unlocks for the shift." },
      { icon: Pill, title: "Doses in order", body: "Due now, late, given — with high-priority medicines called out." },
      { icon: ListChecks, title: "Care tasks", body: "Meals, showers, walks and water, checked off with a time and your name." },
      { icon: ClipboardCheck, title: "Self-writing hand-off", body: "The end-of-shift note is drafted from what you did. Review, add a line, send." },
      { icon: CalendarClock, title: "Your schedule", body: "Two weeks ahead, with new shifts to accept." },
      { icon: Repeat, title: "Shift swaps", body: "Ask another caregiver to cover; the guardian approves." },
      { icon: Lock, title: "Auto-lock", body: "The app locks itself on a shared phone after a few idle minutes." },
    ],
  },
  guardian: {
    color: "var(--guard)", soft: "var(--guard-soft)",
    items: [
      { icon: LayoutDashboard, title: "Today at a glance", body: "Check-in, doses, tasks and who's with Mom — in seconds." },
      { icon: CheckCircle2, title: "Approvals", body: "Medicine changes, new members and swaps wait for your yes." },
      { icon: Users, title: "Care circle", body: "Invite by role, set temporary access, choose who gets SOS first." },
      { icon: CalendarX2, title: "Coverage gaps", body: "Uncovered shifts flagged a day ahead; late arrivals flagged in minutes." },
      { icon: Activity, title: "Activity history", body: "Every dose, visit, note and alert, filterable by day and type." },
      { icon: BarChart3, title: "Weekly digest", body: "Adherence trend, visits and check-in streak every Sunday." },
      { icon: FileText, title: "Notes & documents", body: "Care plans and discharge papers, encrypted and access-controlled." },
      { icon: Bell, title: "Alerts your way", body: "Push, text or email, with quiet hours that emergencies ignore." },
    ],
  },
};

export default function Features() {
  const [who, setWho] = useState<keyof typeof sets>("elder");
  const set = sets[who];
  return (
    <SitePage>
      <PageHero kicker="Features" title="Built for three people at once." lede="The same care plan, shown three ways — simple for the elder, practical for the caregiver, complete for the guardian." />
      <section className="lp-wrap" style={{ paddingBottom: 96 }}>
        <div className="persona-tabs">
          <Segmented label="Show features for" value={who} onChange={setWho} options={[{ value: "elder", label: "For Maggie" }, { value: "caregiver", label: "For Ana" }, { value: "guardian", label: "For Sarah" }]} />
        </div>
        <div className="feat-grid" aria-live="polite">
          {set.items.map((f) => (
            <article key={f.title} className="feat">
              <span className="feat-icon" style={{ background: set.soft, color: set.color }}><f.icon size={22} /></span>
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </article>
          ))}
        </div>
        <div className="center" style={{ marginTop: 48 }}>
          <Link to="/app" className="btn lg">Try it as {who === "elder" ? "Maggie" : who === "caregiver" ? "Ana" : "Sarah"}</Link>
        </div>
      </section>
    </SitePage>
  );
}
