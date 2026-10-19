import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useStore } from "../../data/store";
import { Toggle } from "../../components/ui";
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
    </div>
  );
}
