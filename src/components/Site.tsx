import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { photos } from "../data/images";
import "../pages/landing.css";

const links = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/features", label: "Features" },
  { to: "/who-its-for", label: "Who it's for" },
  { to: "/privacy", label: "Privacy" },
  { to: "/pilot", label: "Join the pilot" },
];

/** Shared marketing-site chrome: translucent Apple-style nav (with a mobile menu) and footer. */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="lp-nav" aria-label="Main">
      <div className="lp-nav-inner">
        <Link to="/" className="lp-brand" aria-label="Circle Care home"><Logo size={24} /> Circle Care</Link>
        <div className="lp-links">
          {links.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
        </div>
        <Link to="/app" className="btn sm lp-open">Open the app</Link>
        <button className="lp-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      {open && (
        <div className="lp-menu">
          {links.map((l) => <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</NavLink>)}
          <Link to="/app" className="btn block" onClick={() => setOpen(false)}>Open the app</Link>
        </div>
      )}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        <div className="foot-links">
          <Link to="/">Overview</Link>
          {links.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
          <Link to="/app">Open the app</Link>
        </div>
        <p className="small"><b>Circle Care</b> is a product concept. The demo uses fictional people and runs entirely in your browser — no real health information is collected or sent anywhere.</p>
        <p className="tiny">
          Photos from Unsplash, used under the Unsplash License:{" "}
          {Object.values(photos).map((p, i, arr) => (
            <span key={p.page}><a href={p.page} target="_blank" rel="noreferrer">{p.credit}</a>{i < arr.length - 1 ? ", " : "."}</span>
          ))}
        </p>
      </div>
    </footer>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({ kicker, title, lede, children }: { kicker: string; title: string; lede: string; children?: ReactNode }) {
  return (
    <header className="sub-hero">
      <p className="sub-kicker">{kicker}</p>
      <h1 className="t-xl balance">{title}</h1>
      <p className="lede balance">{lede}</p>
      {children}
    </header>
  );
}
