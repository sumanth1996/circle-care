import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Heart, Droplets, Scale, Ruler, Footprints, PersonStanding, Moon, Smile, Brain, AlertTriangle, ChevronLeft, ChevronRight, Watch, HeartPulse, Activity, EyeOff, Table2, Settings2 } from "lucide-react";
import { useStore, useCan } from "../../data/store";
import { clock, todayOf } from "../../data/selectors";
import { Segmented } from "../../components/ui";
import { LineChart, ColumnChart, Sparkline, Meter, ChartLegend, STATUS_CRITICAL } from "../../components/charts";
import {
  readingsFor, detectEvents, summarize, restingHr, bmi, activityFor, sleepFor, moodFrom, mindfulMinutes, weightSeries,
  minutesToHm, nextReadingAt, GOALS, type VitalEvent, type SleepStage,
} from "../../lib/health";
import { addDays, fmtShortDay, fmtTime, ymd } from "../../lib/time";
import "./health.css";

// Validated palettes (dataviz validator, light surface):
//  • activity breakdown: blue / orange / aqua / yellow — categorical slots 1–4, all checks pass
//  • lines: heart = magenta, oxygen = blue; unusual readings use the reserved critical red + a label
const C = { heart: "#d55181", oxygen: "#2a78d6", weight: "#6250d6", steps: "#2a78d6", sleep: "#2a78d6", awake: "#eb6834", stand: "#1baf7a", walk: "#eb6834", rest: "#eda100" };
const KIND_COLOR = { sleep: C.sleep, rest: C.rest, stand: C.stand, walk: C.walk } as const;
const KIND_LABEL = { sleep: "Sleeping", rest: "Sitting or resting", stand: "Standing", walk: "Walking" } as const;

const hourTicks = [0, 360, 720, 1080, 1440].map((at) => ({ at, label: ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"][at / 360] }));
const lb = (kg: number) => Math.round(kg * 2.20462);
const lb1 = (kg: number) => Math.round(kg * 22.0462) / 10;
const ftIn = (cm: number) => { const inches = Math.round(cm / 2.54); return `${Math.floor(inches / 12)}′${inches % 12}″`; };

type Tab = "summary" | "vitals" | "activity";

/** CC-84 – CC-93: Health for the legal guardian — summary, vitals with unusual-reading detection, activity and well-being. */
export default function Health() {
  const { state, actions } = useStore();
  const allowed = useCan("read", "vitals");
  const [tab, setTab] = useState<Tab>("summary");
  const [dayOffset, setDayOffset] = useState(0);
  const now = clock(state);
  const today = todayOf(state);
  const day = ymd(addDays(now, -dayOffset));
  const v = state.settings.vitals;

  useEffect(() => { if (allowed) actions.logView("health readings"); }, [actions, allowed]);

  const readings = useMemo(() => readingsFor(day, now, v.intervalMin, state.health.overrides, today), [day, now.getHours(), Math.floor(now.getMinutes() / v.intervalMin), v.intervalMin, state.health.overrides, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => detectEvents(readings, v.thresholds), [readings, v.thresholds]);
  const todayReadings = useMemo(() => readingsFor(today, now, v.intervalMin, state.health.overrides, today), [today, now.getHours(), Math.floor(now.getMinutes() / v.intervalMin), v.intervalMin, state.health.overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayEvents = useMemo(() => detectEvents(todayReadings, v.thresholds), [todayReadings, v.thresholds]);
  const activity = useMemo(() => activityFor(day, now, today), [day, now.getHours(), today]); // eslint-disable-line react-hooks/exhaustive-deps
  const weights = useMemo(() => weightSeries(now), [today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) {
    return (
      <div className="page narrow center" style={{ paddingTop: 56 }}>
        <EyeOff size={48} color="var(--muted)" style={{ margin: "0 auto" }} />
        <h1 className="t-lg" style={{ marginTop: 14 }}>Maggie isn't sharing health readings</h1>
        <p className="lede balance" style={{ maxWidth: 480, margin: "10px auto 0" }}>She can turn this back on in her Privacy Center. Medicines, check-ins, the calendar and SOS work as usual.</p>
      </div>
    );
  }

  const latest = todayReadings.at(-1);
  const stepper = (
    <div className="day-stepper" role="group" aria-label="Choose a day">
      <button className="btn plain sm" aria-label="Previous day" disabled={dayOffset >= 6} onClick={() => setDayOffset(dayOffset + 1)}><ChevronLeft size={18} /></button>
      <b>{dayOffset === 0 ? "Today" : dayOffset === 1 ? "Yesterday" : fmtShortDay(day)}</b>
      <button className="btn plain sm" aria-label="Next day" disabled={dayOffset === 0} onClick={() => setDayOffset(dayOffset - 1)}><ChevronRight size={18} /></button>
    </div>
  );

  return (
    <div className="page health stack" style={{ "--gap": "20px" } as CSSProperties}>
      <div className="page-head">
        <div>
          <p className="page-kicker">Maggie's health</p>
          <h1>Health</h1>
          <p className="muted small row wrap" style={{ "--gap": "6px", marginTop: 4 } as CSSProperties}>
            <Watch size={15} /> From {state.health.device} · new reading every {v.intervalMin} min · last {latest ? fmtTime(latest.at) : "—"}, next {fmtTime(nextReadingAt(now, v.intervalMin))}
          </p>
        </div>
        <Link to="/app/guardian/settings#health" className="btn plain sm"><Settings2 size={16} /> Alert settings</Link>
      </div>

      <Segmented label="Health section" value={tab} onChange={(t) => { setTab(t); setDayOffset(0); }} options={[{ value: "summary", label: "Summary" }, { value: "vitals", label: "Heart & oxygen" }, { value: "activity", label: "Activity" }]} />

      {tab === "summary" && <Summary state={state} readings={todayReadings} events={todayEvents} weights={weights} activity={activityFor(today, now, today)} today={today} onOpen={setTab} />}
      {tab === "vitals" && (
        <>
          {stepper}
          <Vitals readings={readings} events={events} thresholds={v.thresholds} weights={weights} />
        </>
      )}
      {tab === "activity" && (
        <>
          {stepper}
          <ActivityView activity={activity} day={day} isToday={dayOffset === 0} state={state} now={now} />
        </>
      )}
      <p className="tiny">Demo readings are simulated. In the full product they sync from Maggie's watch through Apple Health or Health Connect, only while she chooses to share them. Circle Care isn't a medical device; call 911 in an emergency.</p>
    </div>
  );
}

/* ---------------- Summary ---------------- */

function Summary({ state, readings, events, weights, activity, today, onOpen }: {
  state: ReturnType<typeof useStore>["state"]; readings: ReturnType<typeof readingsFor>; events: VitalEvent[]; weights: { date: string; kg: number }[];
  activity: ReturnType<typeof activityFor>; today: string; onOpen: (t: Tab) => void;
}) {
  const hr = summarize(readings.map((r) => r.hr));
  const o2 = summarize(readings.map((r) => r.spo2));
  const latest = readings.at(-1);
  const rhr = restingHr(readings);
  const kg = weights.at(-1)!.kg;
  const kgChange = Math.round((kg - weights[0].kg) * 2.20462 * 10) / 10;
  const sleep = sleepFor(today);
  const checkin = state.checkins.find((c) => c.date === today);
  const mood = moodFrom(today, checkin?.mood);
  const age = new Date(today).getFullYear() - state.health.birthYear;

  return (
    <div className="stack" style={{ "--gap": "18px" } as CSSProperties}>
      <section className={`panel attention-panel ${events.length ? "warn" : "ok"}`} aria-labelledby="hs-attn">
        <div className="row">
          {events.length ? <AlertTriangle size={24} color={STATUS_CRITICAL} style={{ flex: "none" }} /> : <HeartPulse size={24} color="var(--green)" style={{ flex: "none" }} />}
          <div className="grow">
            <h2 id="hs-attn" className="t-md">{events.length ? `${events.length} unusual ${events.length === 1 ? "reading" : "readings"} today` : "All readings in Maggie's usual range today"}</h2>
            {events.length > 0 && (
              <ul className="event-list">
                {events.map((e) => <li key={e.at + e.metric}><span className="tnum">{fmtTime(e.at)}</span> {e.label}</li>)}
              </ul>
            )}
          </div>
          {events.length > 0 && <button className="btn sm secondary" onClick={() => onOpen("vitals")}>See trend</button>}
        </div>
      </section>

      <h2 className="section-title">Highlights</h2>
      <div className="hl-grid">
        <Highlight icon={Heart} color={C.heart} name="Heart rate" time={latest && fmtTime(latest.at)} value={latest?.hr ?? "—"} unit="bpm" caption={`Today ${hr.min}–${hr.max} bpm`} spark={readings.slice(-16).map((r) => r.hr)} onClick={() => onOpen("vitals")} />
        <Highlight icon={Droplets} color={C.oxygen} name="Blood oxygen" time={latest && fmtTime(latest.at)} value={latest?.spo2 ?? "—"} unit="%" caption={`Today ${o2.min}–${o2.max}%`} spark={readings.slice(-16).map((r) => r.spo2)} onClick={() => onOpen("vitals")} />
        <Highlight icon={HeartPulse} color={C.heart} name="Resting heart rate" value={rhr ?? "—"} unit="bpm" caption="Average while asleep" />
        <Highlight icon={Footprints} color={C.walk} name="Steps" value={activity.steps.toLocaleString()} unit="" caption={`Goal ${GOALS.steps.toLocaleString()}`} meter={{ value: activity.steps, goal: GOALS.steps }} onClick={() => onOpen("activity")} />
        <Highlight icon={PersonStanding} color={C.stand} name="Stand hours" value={activity.standHours} unit={`/ ${GOALS.standHours} hr`} caption="Hours she stood and moved" meter={{ value: activity.standHours, goal: GOALS.standHours }} onClick={() => onOpen("activity")} />
        <Highlight icon={Activity} color={C.walk} name="Walking" value={activity.walkMin} unit="min" caption={`Goal ${GOALS.walkMin} min`} meter={{ value: activity.walkMin, goal: GOALS.walkMin }} onClick={() => onOpen("activity")} />
        <Highlight icon={Moon} color={C.sleep} name="Sleep last night" value={minutesToHm(sleep.asleepMin)} unit="" caption={`In bed ${fmtTime(sleep.inBed)} – ${fmtTime(sleep.wake)} · woke ${sleep.awakenings}×`} onClick={() => onOpen("activity")} />
        <Highlight icon={Smile} color={C.rest} name="State of mind" value={mood.source === "none" ? "—" : mood.label} unit="" caption={mood.source === "none" ? "No mood added to today's check-in" : "From Maggie's morning check-in"} onClick={() => onOpen("activity")} />
        <Highlight icon={Scale} color={C.weight} name="Weight" value={lb(kg)} unit="lb" caption={`${kgChange > 0 ? "+" : ""}${kgChange} lb in 30 days`} spark={weights.map((w) => w.kg)} onClick={() => onOpen("vitals")} />
        <Highlight icon={Ruler} color={C.weight} name="Height · BMI" value={ftIn(state.health.heightCm)} unit={`· BMI ${bmi(kg, state.health.heightCm)}`} caption={`${state.health.heightCm} cm · age ${age}`} />
      </div>
    </div>
  );
}

function Highlight({ icon: Icon, color, name, time, value, unit, caption, spark, meter, onClick }: {
  icon: typeof Heart; color: string; name: string; time?: string; value: string | number; unit: string; caption: string;
  spark?: number[]; meter?: { value: number; goal: number }; onClick?: () => void;
}) {
  const body = (
    <>
      <span className="hl-top"><span className="hl-name"><Icon size={16} color={color} aria-hidden="true" />{name}</span>{time && <span className="tiny">{time}</span>}</span>
      <span className="hl-mid">
        <span><b className="hl-value">{value}</b> {unit && <span className="hl-unit">{unit}</span>}</span>
        {spark && <Sparkline values={spark} color={color} />}
      </span>
      {meter && <Meter value={meter.value} goal={meter.goal} color={color} track="#ececf0" label={`${name}: ${meter.value} of ${meter.goal}`} />}
      <span className="tiny">{caption}</span>
    </>
  );
  return onClick ? <button className="hl-card" onClick={onClick}>{body}</button> : <div className="hl-card">{body}</div>;
}

/* ---------------- Vitals ---------------- */

function Vitals({ readings, events, thresholds, weights }: { readings: ReturnType<typeof readingsFor>; events: VitalEvent[]; thresholds: ReturnType<typeof useStore>["state"]["settings"]["vitals"]["thresholds"]; weights: { date: string; kg: number }[] }) {
  const [table, setTable] = useState(false);
  const flag = (metric: "hr" | "spo2", at: string) => events.find((e) => e.metric === metric && e.at === at)?.label;
  const toPoint = (metric: "hr" | "spo2") => readings.map((r) => {
    const d = new Date(r.at);
    return { x: d.getHours() * 60 + d.getMinutes(), y: r[metric], label: fmtTime(r.at) + (r.asleep ? " · asleep" : ""), flag: flag(metric, r.at) };
  });
  const hr = summarize(readings.map((r) => r.hr));
  const o2 = summarize(readings.map((r) => r.spo2));
  const hrEvents = events.filter((e) => e.metric === "hr");
  const o2Events = events.filter((e) => e.metric === "spo2");
  const hrMax = Math.max(130, hr.max + 10);

  return (
    <div className="stack" style={{ "--gap": "18px" } as CSSProperties}>
      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="hr-h">
        <div className="metric-head">
          <h2 id="hr-h" className="hl-name"><Heart size={18} color={C.heart} aria-hidden="true" /> Heart rate</h2>
          <span className="metric-stats"><b>{hr.min}–{hr.max}</b> bpm range · <b>{hr.avg}</b> average</span>
        </div>
        <LineChart title="Heart rate across the day" points={toPoint("hr")} xDomain={[0, 1440]} yDomain={[40, hrMax]} xTicks={hourTicks} yTicks={[50, 80, 110].filter((t) => t < hrMax)} color={C.heart} unit="bpm" band={[thresholds.hrLow, thresholds.hrHigh]} />
        <p className="tiny">Shaded band: Maggie's usual range ({thresholds.hrLow}–{thresholds.hrHigh} bpm). A change of {thresholds.hrJump}+ bpm between readings is flagged as sudden.</p>
        <EventList events={hrEvents} empty="No unusual heart-rate readings this day." />
      </section>

      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="o2-h">
        <div className="metric-head">
          <h2 id="o2-h" className="hl-name"><Droplets size={18} color={C.oxygen} aria-hidden="true" /> Blood oxygen</h2>
          <span className="metric-stats"><b>{o2.min}–{o2.max}</b>% range · <b>{o2.avg}</b>% average</span>
        </div>
        <LineChart title="Blood oxygen across the day" points={toPoint("spo2")} xDomain={[0, 1440]} yDomain={[84, 100]} xTicks={hourTicks} yTicks={[85, 90, 95, 100]} color={C.oxygen} unit="%" threshold={{ y: thresholds.spo2Low, label: `Alert below ${thresholds.spo2Low}%` }} />
        <p className="tiny">A drop of {thresholds.spo2Drop}+ points between readings is flagged as sudden.</p>
        <EventList events={o2Events} empty="No unusual oxygen readings this day." />
      </section>

      <button className="btn plain sm" style={{ alignSelf: "flex-start" }} onClick={() => setTable(!table)} aria-expanded={table}><Table2 size={16} /> {table ? "Hide" : "Show"} all readings as a table</button>
      {table && (
        <div className="table-wrap panel flat">
          <table className="data-table">
            <caption className="sr-only">Heart rate and blood oxygen readings</caption>
            <thead><tr><th scope="col">Time</th><th scope="col">Heart rate</th><th scope="col">Blood oxygen</th><th scope="col">Note</th></tr></thead>
            <tbody>
              {readings.map((r) => {
                const f = [flag("hr", r.at), flag("spo2", r.at)].filter(Boolean).join("; ");
                return <tr key={r.at} className={f ? "flag" : ""}><td>{fmtTime(r.at)}</td><td className="tnum">{r.hr} bpm</td><td className="tnum">{r.spo2}%</td><td>{f || (r.asleep ? "Asleep" : "")}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="w-h">
        <div className="metric-head">
          <h2 id="w-h" className="hl-name"><Scale size={18} color={C.weight} aria-hidden="true" /> Weight · last 30 days</h2>
          <span className="metric-stats"><b>{lb1(weights.at(-1)!.kg)}</b> lb now · weighed every few days</span>
        </div>
        <LineChart
          title="Weight over the last 30 days"
          points={weights.map((w, i) => ({ x: i, y: lb1(w.kg), label: fmtShortDay(w.date) }))}
          xDomain={[0, weights.length - 1]}
          yDomain={[Math.floor(Math.min(...weights.map((w) => lb1(w.kg)))) - 1, Math.ceil(Math.max(...weights.map((w) => lb1(w.kg)))) + 1]}
          xTicks={[{ at: 0, label: fmtShortDay(weights[0].date) }, { at: weights.length - 1, label: "Today" }]}
          yTicks={[Math.floor(Math.min(...weights.map((w) => lb1(w.kg)))), Math.ceil(Math.max(...weights.map((w) => lb1(w.kg))))]}
          color={C.weight}
          unit="lb"
          fmt={(y) => y.toFixed(1)}
          height={150}
        />
      </section>
    </div>
  );
}

function EventList({ events, empty }: { events: VitalEvent[]; empty: string }) {
  if (!events.length) return <p className="small muted">{empty}</p>;
  return (
    <ul className="event-list boxed" aria-label="Unusual readings">
      {events.map((e) => (
        <li key={e.at + e.metric}>
          <AlertTriangle size={16} color={STATUS_CRITICAL} aria-hidden="true" />
          <span className="tnum">{fmtTime(e.at)}</span>
          <span className="grow">{e.label}</span>
          <span className="tag">{e.kind === "jump" || e.kind === "drop" ? "Sudden change" : e.kind === "high" ? "High" : "Low"}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Activity & well-being ---------------- */

const STAGES: { key: SleepStage; label: string }[] = [
  { key: "awake", label: "Awake" },
  { key: "rem", label: "REM" },
  { key: "core", label: "Core" },
  { key: "deep", label: "Deep" },
];

function ActivityView({ activity, day, isToday, state, now }: { activity: ReturnType<typeof activityFor>; day: string; isToday: boolean; state: ReturnType<typeof useStore>["state"]; now: Date }) {
  const sleep = sleepFor(day);
  const stageMin = (k: SleepStage) => sleep.segments.filter((s) => s.stage === k).reduce((a, s) => a + s.end - s.start, 0);
  const total = sleep.segments.at(-1)!.end - sleep.segments[0].start;
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(new Date(`${day}T12:00:00`), i - 6)));
  const moods = week.map((d) => moodFrom(d, state.checkins.find((c) => c.date === d)?.mood));
  const visits = state.visits.filter((v) => week.includes(v.date) && v.checkIn).length;
  const counts = { sleep: 0, rest: 0, stand: 0, walk: 0 };
  activity.hours.forEach((h) => counts[h]++);

  return (
    <div className="stack" style={{ "--gap": "18px" } as CSSProperties}>
      <section className="ring-row" aria-label="Daily goals">
        <Goal icon={PersonStanding} color={C.stand} label="Stand hours" value={activity.standHours} goal={GOALS.standHours} unit="hr" />
        <Goal icon={Activity} color={C.walk} label="Walking" value={activity.walkMin} goal={GOALS.walkMin} unit="min" />
        <Goal icon={Footprints} color={C.steps} label="Steps" value={activity.steps} goal={GOALS.steps} unit="" />
      </section>

      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="day-h">
        <div className="metric-head">
          <h2 id="day-h" className="hl-name">How Maggie spent {isToday ? "today so far" : "the day"}</h2>
          <span className="metric-stats">One block per hour</span>
        </div>
        <div className="day-strip" role="img" aria-label={`Hours: ${counts.sleep} sleeping, ${counts.rest} sitting or resting, ${counts.stand} mostly standing, ${counts.walk} walking`}>
          {Array.from({ length: 24 }, (_, h) => {
            const k = activity.hours[h];
            return <span key={h} title={k ? `${h}:00 · ${KIND_LABEL[k]}` : `${h}:00 · not yet`} style={{ background: k ? KIND_COLOR[k] : "#f2f2f7" }} />;
          })}
        </div>
        <div className="row between tiny"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
        <ChartLegend items={(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => ({ color: KIND_COLOR[k], label: <>{KIND_LABEL[k]} <b>{k === "sleep" ? minutesToHm(activity.sleepMin) : k === "rest" ? minutesToHm(activity.restMin) : k === "stand" ? minutesToHm(activity.standMin) : minutesToHm(activity.walkMin)}</b></> }))} />
      </section>

      <section className="panel stack" style={{ "--gap": "10px" } as CSSProperties} aria-labelledby="steps-h">
        <div className="metric-head">
          <h2 id="steps-h" className="hl-name"><Footprints size={18} color={C.steps} aria-hidden="true" /> Steps by hour</h2>
          <span className="metric-stats"><b>{activity.steps.toLocaleString()}</b> steps</span>
        </div>
        <ColumnChart title="Steps by hour" values={activity.stepsByHour} labels={activity.stepsByHour.map((_, h) => `${fmtTime(`${String(h).padStart(2, "0")}:00`)}`)} xTicks={[0, 6, 12, 18].map((i) => ({ i, label: ["12 AM", "6 AM", "12 PM", "6 PM"][i / 6] }))} color={C.steps} unit="steps" highlight={isToday ? now.getHours() : undefined} />
      </section>

      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="sleep-h">
        <div className="metric-head">
          <h2 id="sleep-h" className="hl-name"><Moon size={18} color={C.sleep} aria-hidden="true" /> Sleep · night before {fmtShortDay(day)}</h2>
          <span className="metric-stats"><b>{minutesToHm(sleep.asleepMin)}</b> asleep · woke {sleep.awakenings}×</span>
        </div>
        <div className="hypno" role="img" aria-label={`Sleep stages: ${STAGES.map((s) => `${s.label} ${minutesToHm(stageMin(s.key))}`).join(", ")}`}>
          {STAGES.map((st) => (
            <div key={st.key} className="hypno-row">
              <span className="hypno-label">{st.label}<b>{minutesToHm(stageMin(st.key))}</b></span>
              <span className="hypno-track">
                {sleep.segments.filter((s) => s.stage === st.key).map((s, i) => (
                  <i key={i} style={{ left: `${((s.start - sleep.segments[0].start) / total) * 100}%`, width: `calc(${((s.end - s.start) / total) * 100}% - 2px)`, background: st.key === "awake" ? C.awake : C.sleep }} />
                ))}
              </span>
            </div>
          ))}
          <div className="row between tiny" style={{ marginLeft: 92 }}><span>{fmtTime(sleep.inBed)}</span><span>{fmtTime(sleep.wake)}</span></div>
        </div>
        <div className="stack" style={{ "--gap": "4px" } as CSSProperties}>
          <Meter value={sleep.asleepMin} goal={GOALS.sleepMin} color={C.sleep} track="#ececf0" label={`Sleep ${minutesToHm(sleep.asleepMin)} of ${minutesToHm(GOALS.sleepMin)} goal`} />
          <span className="tiny">{sleep.asleepMin >= GOALS.sleepMin ? "Met" : "Below"} the {GOALS.sleepMin / 60}-hour sleep goal</span>
        </div>
      </section>

      <section className="panel stack" style={{ "--gap": "12px" } as CSSProperties} aria-labelledby="mind-h">
        <div className="metric-head">
          <h2 id="mind-h" className="hl-name"><Brain size={18} color={C.weight} aria-hidden="true" /> Mental well-being · 7 days</h2>
          <span className="metric-stats">{visits} caregiver visits · {mindfulMinutes(day)} mindful min today</span>
        </div>
        <div className="mood-week" role="list">
          {moods.map((m) => (
            <div key={m.date} className="mood-day" role="listitem" aria-label={`${fmtShortDay(m.date)}: ${m.label}`}>
              <span className="mood-scale">
                {m.source !== "none" && <i style={{ bottom: `${((m.valence + 2) / 4) * 100}%` }} />}
              </span>
              <b className="tiny">{new Date(`${m.date}T12:00:00`).toLocaleDateString([], { weekday: "narrow" })}</b>
            </div>
          ))}
          <div className="mood-axis tiny" aria-hidden="true"><span>Very pleasant</span><span>Neutral</span><span>Unpleasant</span></div>
        </div>
        <p className="tiny">Mood comes from the face Maggie picks at her morning check-in — she can always skip it. Low moods several days in a row are a good moment for a call.</p>
      </section>
    </div>
  );
}

function Goal({ icon: Icon, color, label, value, goal, unit }: { icon: typeof Heart; color: string; label: string; value: number; goal: number; unit: string }) {
  const pct = Math.min(1, value / goal);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="goal" role="meter" aria-label={`${label}: ${value} of ${goal} ${unit}`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={goal}>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#ececf0" strokeWidth="10" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 44 44)" />
      </svg>
      <Icon size={20} color={color} className="goal-icon" aria-hidden="true" />
      <b>{value.toLocaleString()}<span className="hl-unit"> / {goal.toLocaleString()} {unit}</span></b>
      <span className="tiny">{label}</span>
    </div>
  );
}
