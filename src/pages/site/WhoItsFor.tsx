import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { SitePage, PageHero } from "../../components/Site";
import { Photo } from "../../components/ui";
import type { PhotoKey } from "../../data/images";

const people: { photo: PhotoKey; tone: string; role: string; title: string; quote: string; by: string; points: string[] }[] = [
  {
    photo: "elderPortrait", tone: "var(--elder)", role: "For older adults", title: "Independence, with a safety net.",
    quote: "“I don't want to be watched. I want to be able to ask for help.”", by: "Design hypothesis · to be validated in interviews (CC-2)",
    points: ["Decide who is in your circle — and remove anyone", "See every decision made about your care", "Pause sharing whenever you want; SOS still works", "Large text, spoken reminders, three big buttons"],
  },
  {
    photo: "caregiverTalk", tone: "var(--care)", role: "For caregivers", title: "Know exactly what this shift needs.",
    quote: "“Half my morning is figuring out what happened yesterday.”", by: "Design hypothesis · to be validated in interviews (CC-3)",
    points: ["Today's plan in time order, the moment you check in", "Read the last hand-off before you start", "A record of every dose and task you did", "Hand-offs drafted for you at check-out"],
  },
  {
    photo: "family", tone: "var(--guard)", role: "For legal guardians", title: "Peace of mind from two hours away.",
    quote: "“I find out about problems days later, from someone else.”", by: "Design hypothesis · to be validated in interviews (CC-4)",
    points: ["Today at a glance, alerts only when something needs you", "Approve medicine changes and new members", "Coverage gaps flagged before they happen", "A weekly digest instead of daily phone calls"],
  },
];

export default function WhoItsFor() {
  return (
    <SitePage>
      <PageHero kicker="Who it's for" title="Everyone who helps, on the same page." lede="Circle Care is built around one person — and the people who make it possible for them to keep living at home." />
      {people.map((p, i) => (
        <section key={p.role} className={`sub-band ${i % 2 ? "mist" : ""}`}>
          <div className={`lp-wrap split ${i % 2 ? "rev" : ""}`}>
            <Photo k={p.photo} w={1200} className="split-img" />
            <div className="copy-stack">
              <p className="sub-kicker" style={{ color: p.tone, filter: "brightness(0.85)" }}>{p.role}</p>
              <h2 className="t-lg balance">{p.title}</h2>
              <blockquote style={{ margin: 0 }}>
                <p className="quote">{p.quote}</p>
                <footer className="quote-by">{p.by}</footer>
              </blockquote>
              <ul className="checklist">
                {p.points.map((x) => <li key={x}><Check size={20} color={p.tone} /> <span>{x}</span></li>)}
              </ul>
            </div>
          </div>
        </section>
      ))}
      <section className="sub-band center">
        <div className="lp-wrap copy-stack" style={{ alignItems: "center" }}>
          <h2 className="t-lg balance">See it from each side.</h2>
          <p className="lede balance" style={{ maxWidth: 560 }}>The demo lets you switch between Maggie, Ana and Sarah in one tap.</p>
          <Link to="/app" className="btn lg">Try the demo</Link>
        </div>
      </section>
    </SitePage>
  );
}
