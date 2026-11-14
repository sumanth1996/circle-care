import { Check, GlassWater, Minus, Plus, Coffee, Sandwich, Soup } from "lucide-react";
import type { Feeling, Meal } from "../data/types";
import { useStore } from "../data/store";
import { FEELINGS, MEALS, dailyLogFor, dailyShared } from "../data/everyday";
import { useToast } from "./ui";
import "./everyday.css";

/* ---------------- Drawn faces (no emoji, per the design system) ---------------- */

const FACE_TINT: Record<Feeling, string> = { great: "#ffd36b", good: "#ffe08a", calm: "#cfe8ff", okay: "#e9e9ef", uneasy: "#e4dcff", low: "#d6e4f5" };
const MOUTH: Record<Feeling, string> = {
  great: "M14 25 Q24 36 34 25", good: "M15 27 Q24 33 33 27", calm: "M16 28 Q24 31 32 28",
  okay: "M16 29 L32 29", uneasy: "M16 31 Q24 27 32 31", low: "M15 33 Q24 25 33 33",
};

/** A simple drawn face for each feeling. Calm has closed eyes; the others have dots. */
export function Face({ feeling, size = 44 }: { feeling: Feeling; size?: number }) {
  const closed = feeling === "calm";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill={FACE_TINT[feeling]} />
      <circle cx="24" cy="24" r="21.25" fill="none" stroke="rgba(29,29,31,0.08)" strokeWidth="1.5" />
      {closed ? (
        <g stroke="#3a3a3c" strokeWidth="2.4" strokeLinecap="round" fill="none"><path d="M14 19 Q17 22 20 19" /><path d="M28 19 Q31 22 34 19" /></g>
      ) : (
        <g fill="#3a3a3c"><circle cx="17" cy="19" r="2.6" /><circle cx="31" cy="19" r="2.6" /></g>
      )}
      {feeling === "low" && <g stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round"><path d="M13 14 L19 12.5" /><path d="M35 14 L29 12.5" /></g>}
      <path d={MOUTH[feeling]} stroke="#3a3a3c" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const MEAL_ICON: Record<Meal, typeof Coffee> = { breakfast: Coffee, lunch: Sandwich, dinner: Soup };

/* ---------------- CC-142: Maggie's one-tap check-ins ---------------- */

/** Three optional rows. Every tap saves; there's no Submit button. */
export function DailyCheckins() {
  const { state, actions } = useStore();
  const toast = useToast();
  const log = dailyLogFor(state);
  const goal = state.settings.dailyLog.waterGoal;
  const saved = (msg: string) => toast(msg);

  return (
    <section className="daily glass" aria-labelledby="daily-h">
      <div className="daily-head">
        <h2 id="daily-h">My day</h2>
        <span className="daily-note">Optional · saves as you tap</span>
      </div>

      <div className="daily-row" role="group" aria-labelledby="feel-h">
        <h3 id="feel-h">How do you feel?</h3>
        <div className="faces">
          {FEELINGS.map((f) => (
            <button key={f.key} type="button" className="face" aria-pressed={log.feeling === f.key} aria-label={f.label}
              onClick={() => { const off = log.feeling === f.key; actions.logDaily({ feeling: off ? null : f.key }); saved(off ? "Feeling cleared" : `Saved: ${f.label}`); }}>
              <Face feeling={f.key} size={52} />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="daily-row" role="group" aria-labelledby="water-h">
        <h3 id="water-h">Water</h3>
        <div className="water">
          <button type="button" className="round" aria-label="One glass less" disabled={log.water === 0} onClick={() => actions.logDaily({ waterBy: -1 })}><Minus size={26} /></button>
          <div className="glasses" aria-live="polite" aria-label={`${log.water} of ${goal} glasses`}>
            <b>{log.water}</b> <span>of {goal} glasses</span>
            <span className="glass-dots" aria-hidden="true">{Array.from({ length: Math.max(goal, log.water) }, (_, i) => <GlassWater key={i} size={20} className={i < log.water ? "on" : ""} />)}</span>
          </div>
          <button type="button" className="round add" aria-label="One more glass" disabled={log.water >= 20} onClick={() => { actions.logDaily({ waterBy: 1 }); if (log.water + 1 === goal) saved("That's your goal for today"); }}><Plus size={26} /></button>
        </div>
      </div>

      <div className="daily-row" role="group" aria-labelledby="meals-h">
        <h3 id="meals-h">Meals</h3>
        <div className="meals">
          {MEALS.map((m) => {
            const on = log.meals.includes(m.key);
            const I = MEAL_ICON[m.key];
            return (
              <button key={m.key} type="button" className="meal" aria-pressed={on} onClick={() => { actions.logDaily({ meal: m.key }); saved(on ? `${m.label} un-ticked` : `Saved: ${m.label}`); }}>
                {on ? <Check size={24} /> : <I size={24} />} {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="daily-foot">{!dailyShared(state) ? "Only you can see this." : log.private ? "Today stays private, because you started it while not sharing." : "Sarah can see this. Change it in My privacy."}</p>
    </section>
  );
}
