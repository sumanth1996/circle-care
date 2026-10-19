import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useStore } from "../../data/store";
import { Toggle, useToast } from "../../components/ui";
import { nameOf } from "../../data/selectors";
import type { Settings } from "../../data/types";
import "./elder.css";

const sizes: { v: Settings["textSize"]; label: string; px: number }[] = [
  { v: "large", label: "Large", px: 19 },
  { v: "xl", label: "Larger", px: 22 },
  { v: "xxl", label: "Largest", px: 26 },
];

/** CC-70: large text, high contrast, big touch targets — chosen by the elder. */
export default function ElderSettings() {
  const { state, actions } = useStore();
  const nav = useNavigate();
  const s = state.settings;
  const toast = useToast();
  const [suggest, setSuggest] = useState("");
  return (
    <div className="page stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <button className="btn ghost" style={{ alignSelf: "flex-start", fontSize: "inherit", paddingLeft: 0 }} onClick={() => nav("/app/elder")}><ArrowLeft /> Home</button>
      <h1 style={{ fontSize: "1.8em" }}>Make it easier to see</h1>
      <div className="stack" role="radiogroup" aria-label="Text size" style={{ "--gap": "10px" } as React.CSSProperties}>
        {sizes.map((x) => (
          <button key={x.v} role="radio" aria-checked={s.textSize === x.v} className="list-row" onClick={() => actions.settings({ textSize: x.v })}
            style={{ background: "#fff", borderRadius: 20, boxShadow: s.textSize === x.v ? "0 0 0 3px var(--blue)" : "var(--shadow-soft)", fontSize: x.px, fontWeight: 600, minHeight: 72 }}>
            <span className="grow">{x.label} text</span>
            {s.textSize === x.v && <span className="badge blue">Selected</span>}
          </button>
        ))}
      </div>
      <div className="list">
        <label className="list-row" style={{ minHeight: 72 }}><span className="grow" style={{ fontWeight: 600 }}>High contrast</span><Toggle checked={s.highContrast} onChange={(v) => actions.settings({ highContrast: v })} label="High contrast" /></label>
        <label className="list-row" style={{ minHeight: 72 }}><span className="grow" style={{ fontWeight: 600 }}>Read things aloud</span><Toggle checked={s.readAloud} onChange={(v) => actions.settings({ readAloud: v })} label="Read things aloud" /></label>
      </div>
      <p className="muted" style={{ fontSize: "0.8em" }}>Circle Care also follows the text size you set on your phone.</p>

      <h2 style={{ fontSize: "1.4em", marginTop: 8 }}>Lock Circle Care</h2>
      <p className="muted" style={{ fontSize: "0.85em", marginTop: -8 }}>If other people use your phone, Circle Care can lock itself when you're not using it.</p>
      <div className="stack" role="radiogroup" aria-label="Lock Circle Care" style={{ "--gap": "10px" } as React.CSSProperties}>
        {[{ v: 0, label: "Never lock" }, { v: 5, label: "After 5 minutes" }, { v: 15, label: "After 15 minutes" }].map((o) => (
          <button key={o.v} role="radio" aria-checked={s.elderLockMin === o.v} className="list-row" onClick={() => actions.settings({ elderLockMin: o.v })}
            style={{ background: "#fff", borderRadius: 20, boxShadow: s.elderLockMin === o.v ? "0 0 0 3px var(--blue)" : "var(--shadow-soft)", fontWeight: 600, minHeight: 72 }}>
            <span className="grow">{o.label}</span>
            {s.elderLockMin === o.v && <span className="badge blue">Selected</span>}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: "1.4em", marginTop: 8 }}>Who we call when you press SOS</h2>
      <ol className="list" style={{ paddingLeft: 0, listStyle: "none" }}>
        {s.escalation.map((id, i) => <li key={id} className="list-row" style={{ minHeight: 64 }}><b style={{ width: 28 }}>{i + 1}.</b><span className="grow">{nameOf(state, id)}</span></li>)}
      </ol>
      <form className="stack" style={{ "--gap": "10px" } as React.CSSProperties} onSubmit={(e) => { e.preventDefault(); if (!suggest.trim()) return; actions.elderSuggest(suggest.trim()); setSuggest(""); toast("Sent to Sarah"); }}>
        <label htmlFor="suggest" style={{ fontWeight: 600 }}>Want a change? Tell Sarah.</label>
        <textarea id="suggest" className="input" style={{ fontSize: "inherit" }} placeholder="For example: call Ruth before James" value={suggest} onChange={(e) => setSuggest(e.target.value)} />
        <button className="btn lg block" disabled={!suggest.trim()}>Send suggestion</button>
      </form>
    </div>
  );
}
