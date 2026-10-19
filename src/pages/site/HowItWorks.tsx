import { Link } from "react-router-dom";
import { Sun, LogIn, Pill, Bell, Siren, ClipboardCheck, BarChart3, Phone, UserPlus, ShieldCheck, Users } from "lucide-react";
import { SitePage, PageHero } from "../../components/Site";
import { Photo } from "../../components/ui";

const day = [
  { t: "8:40 AM", icon: Sun, color: "var(--elder)", who: "Maggie", title: "One tap: “I'm OK.”", body: "Maggie checks in from her home screen. Sarah sees a green check on her phone instead of making a worried call." },
  { t: "8:02 AM", icon: LogIn, color: "var(--care)", who: "Ana", title: "Ana checks in at the door.", body: "Her location is confirmed once. Now — and only now — she can see today's medicines and tasks, plus the note James left on Sunday." },
  { t: "8:06 AM", icon: Pill, color: "var(--green)", who: "Ana", title: "Morning doses, verified.", body: "Ana marks Lisinopril and Metformin as given. Both count as caregiver-verified in the family's weekly numbers." },
  { t: "12:30 PM", icon: Bell, color: "var(--blue)", who: "Maggie", title: "A gentle, spoken reminder.", body: "“Time for Vitamin D, one softgel with lunch.” The lock screen just says “You have a reminder” — nothing private." },
  { t: "1:35 PM", icon: Siren, color: "var(--red)", who: "Maggie", title: "She feels dizzy and holds SOS.", body: "After a 10-second chance to cancel, Sarah is alerted first. If she doesn't answer in two minutes, Ana is next, then James." },
  { t: "1:36 PM", icon: Phone, color: "var(--green)", who: "Sarah", title: "“I'm on my way.”", body: "Sarah taps once. Maggie's screen changes to Sarah's photo and “Sarah is coming,” and the alerts stop going to everyone else." },
  { t: "2:00 PM", icon: ClipboardCheck, color: "var(--care)", who: "Ana", title: "A hand-off that writes itself.", body: "At check-out, Ana's note is already drafted from what she did. She adds “keep an eye on her knee” and sends it." },
  { t: "Sunday", icon: BarChart3, color: "var(--guard)", who: "Sarah", title: "The week, in one look.", body: "Sarah's digest: 96% of doses taken, 6 visits, a 9-day check-in streak. The email never names a medicine." },
];
// Chronological: Ana arrives (8:02), gives morning doses (8:06), then Maggie checks in (8:40).
const ordered = [day[1], day[2], day[0], ...day.slice(3)];

export default function HowItWorks() {
  return (
    <SitePage>
      <PageHero kicker="How it works" title="One day in Maggie's circle." lede="Circle Care is quiet when things are fine and loud when they're not. Here's an ordinary Tuesday — and the one moment that wasn't." />

      <section className="lp-wrap">
        <ol className="day" aria-label="A day with Circle Care" style={{ listStyle: "none", padding: 0 }}>
          {ordered.map((m) => (
            <li key={m.t + m.title} className="moment">
              <span className="moment-time">{m.t}</span>
              <span className="moment-dot" style={{ background: m.color }} aria-hidden="true"><m.icon size={18} /></span>
              <div className="moment-card">
                <span className="moment-who" style={{ color: m.color, filter: "brightness(0.85)" }}>{m.who}</span>
                <h3 className="t-sm">{m.title}</h3>
                <p className="muted">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sub-band mist" style={{ marginTop: 96 }}>
        <div className="lp-wrap">
          <h2 className="t-xl center balance">Set up in an afternoon.</h2>
          <p className="lede center balance lp-sub">Usually started by a son or daughter. Always confirmed by the elder.</p>
          <ol className="steps" style={{ listStyle: "none", padding: 0 }}>
            <li className="step">
              <span className="step-n">1</span><Users color="var(--elder)" />
              <h3 className="t-sm">Create the circle</h3>
              <p className="muted">Add the person you're caring for. They confirm the circle and everyone in it from their own phone.</p>
            </li>
            <li className="step">
              <span className="step-n">2</span><UserPlus color="var(--care)" />
              <h3 className="t-sm">Invite helpers by role</h3>
              <p className="muted">Family sees today's plan. Professional caregivers see it only during their shifts. Temporary helpers get access that ends on its own.</p>
            </li>
            <li className="step">
              <span className="step-n">3</span><ShieldCheck color="var(--guard)" />
              <h3 className="t-sm">Verify the guardian</h3>
              <p className="muted">Upload a power of attorney or guardianship order. Once it's verified, the guardian can approve medicine changes and new members.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="sub-band">
        <div className="lp-wrap split">
          <Photo k="caregiver" w={1200} className="split-img" />
          <div className="copy-stack">
            <h2 className="t-lg balance">The elder stays in charge.</h2>
            <p className="lede">Maggie sees every decision made about her, can pause sharing with one switch, and can see who looked at her information and when.</p>
            <div className="row wrap"><Link to="/privacy" className="btn">How privacy works</Link><Link to="/app" className="btn ghost">Try the demo</Link></div>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
